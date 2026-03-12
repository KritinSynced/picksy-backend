const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');

// Advanced AI recommendation algorithm
const getRecommendations = async (userId) => {
  try {
    // If guest user, return trending products
    if (userId === 'guest') {
      return await Product.aggregate([
        {
          $addFields: {
            popularityScore: {
              $add: [
                { $multiply: ["$rating", 20] },
                { $multiply: [{ $size: "$reviews" }, 2] }
              ]
            }
          }
        },
        { $sort: { popularityScore: -1 } },
        { $limit: 10 }
      ]);
    }

    const user = await User.findById(userId);
    if (!user) return [];

    // Get user's browsing and purchase history
    const viewedProducts = user.browsingHistory.map(h => h.productId);
    const purchasedProducts = user.purchaseHistory.map(h => h.productId);
    const userPreferences = user.preferences || { 
      favoriteCategories: [], 
      preferredBrands: [],
      priceRange: { min: 0, max: 10000 }
    };

    // Combine all interacted products
    const interactedProducts = [...viewedProducts, ...purchasedProducts];

    // Get details of interacted products
    const interactedItems = await Product.find({
      _id: { $in: interactedProducts }
    });

    // Extract categories and brands from history
    const categoryWeights = {};
    const brandWeights = {};
    
    interactedItems.forEach(item => {
      // Weight categories based on frequency
      categoryWeights[item.category] = (categoryWeights[item.category] || 0) + 1;
      if (item.brand) {
        brandWeights[item.brand] = (brandWeights[item.brand] || 0) + 1;
      }
    });

    // Add user preferences with higher weight
    userPreferences.favoriteCategories.forEach(cat => {
      categoryWeights[cat] = (categoryWeights[cat] || 0) + 3;
    });
    
    userPreferences.preferredBrands.forEach(brand => {
      brandWeights[brand] = (brandWeights[brand] || 0) + 3;
    });

    // Get top categories and brands
    const topCategories = Object.entries(categoryWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    const topBrands = Object.entries(brandWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    // Find recommendations based on complex scoring
    const recommendations = await Product.aggregate([
      {
        $match: {
          $and: [
            { _id: { $nin: interactedProducts } }, // Exclude already interacted products
            { price: { 
              $gte: userPreferences.priceRange.min,
              $lte: userPreferences.priceRange.max 
            }}
          ]
        }
      },
      {
        $addFields: {
          categoryScore: {
            $cond: [
              { $in: ["$category", topCategories] },
              10,
              0
            ]
          },
          brandScore: {
            $cond: [
              { $in: ["$brand", topBrands] },
              5,
              0
            ]
          },
          priceScore: {
            $switch: {
              branches: [
                { case: { $lte: ["$price", 50] }, then: 3 },
                { case: { $lte: ["$price", 100] }, then: 2 },
                { case: { $lte: ["$price", 200] }, then: 1 }
              ],
              default: 0
            }
          },
          ratingScore: { $multiply: ["$rating", 2] },
          reviewScore: { $multiply: [{ $size: "$reviews" }, 0.5] }
        }
      },
      {
        $addFields: {
          totalScore: {
            $add: [
              "$categoryScore",
              "$brandScore",
              "$priceScore",
              "$ratingScore",
              "$reviewScore"
            ]
          }
        }
      },
      { $sort: { totalScore: -1 } },
      { $limit: 10 }
    ]);

    return recommendations;
  } catch (error) {
    console.error('Recommendation error:', error);
    return [];
  }
};

// Get personalized recommendations for user
router.get('/user/:userId', async (req, res) => {
  try {
    const recommendations = await getRecommendations(req.params.userId);
    
    // Save recommendations for registered users
    if (req.params.userId !== 'guest') {
      const user = await User.findById(req.params.userId);
      if (user) {
        // Clear old recommendations
        user.savedRecommendations = [];
        
        // Save new recommendations
        user.savedRecommendations = recommendations.map(p => ({
          productId: p._id,
          reason: generateRecommendationReason(p, user),
          date: new Date()
        }));
        
        await user.save();
      }
    }

    res.json(recommendations);
  } catch (err) {
    console.error('Error getting recommendations:', err);
    res.status(500).json({ message: 'Error getting recommendations', error: err.message });
  }
});

// Helper function to generate recommendation reason
const generateRecommendationReason = (product, user) => {
  const reasons = [
    `Based on your interest in ${product.category}`,
    `Popular in ${product.category}`,
    `Similar to items you've viewed`,
    `Top rated in ${product.category}`,
    `Recommended for you`
  ];
  
  if (product.brand && user.preferences?.preferredBrands?.includes(product.brand)) {
    return `From your favorite brand: ${product.brand}`;
  }
  
  return reasons[Math.floor(Math.random() * reasons.length)];
};

// Get trending products
router.get('/trending', async (req, res) => {
  try {
    const trending = await Product.aggregate([
      {
        $addFields: {
          popularityScore: {
            $add: [
              { $multiply: ["$rating", 10] },
              { $size: "$reviews" },
              { $multiply: [{ $divide: [new Date(), "$createdAt"] }, 0.001] }
            ]
          }
        }
      },
      { $sort: { popularityScore: -1 } },
      { $limit: 10 }
    ]);

    res.json(trending);
  } catch (err) {
    console.error('Error getting trending products:', err);
    res.status(500).json({ message: 'Error getting trending products', error: err.message });
  }
});

// Get similar products based on a product
router.post('/similar', async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const similar = await Product.aggregate([
      {
        $match: {
          _id: { $ne: product._id }
        }
      },
      {
        $addFields: {
          similarityScore: {
            $add: [
              { $cond: [{ $eq: ["$category", product.category] }, 10, 0] },
              { $cond: [{ $eq: ["$brand", product.brand] }, 5, 0] },
              { 
                $multiply: [
                  { $abs: { $subtract: ["$price", product.price] } },
                  -0.01
                ]
              },
              { $multiply: ["$rating", 2] }
            ]
          }
        }
      },
      { $sort: { similarityScore: -1 } },
      { $limit: 6 }
    ]);

    res.json(similar);
  } catch (err) {
    console.error('Error getting similar products:', err);
    res.status(500).json({ message: 'Error getting similar products', error: err.message });
  }
});

// Get category-based recommendations
router.get('/category/:category', async (req, res) => {
  try {
    const recommendations = await Product.find({
      category: req.params.category.toLowerCase()
    })
    .sort({ rating: -1, createdAt: -1 })
    .limit(8);

    res.json(recommendations);
  } catch (err) {
    console.error('Error getting category recommendations:', err);
    res.status(500).json({ message: 'Error getting recommendations', error: err.message });
  }
});

// Get personalized recommendations based on user's browsing history only
router.get('/history-based/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const viewedProducts = user.browsingHistory.map(h => h.productId);
    
    if (viewedProducts.length === 0) {
      // If no history, return trending
      const trending = await Product.find().sort({ rating: -1 }).limit(8);
      return res.json(trending);
    }

    // Get categories from viewed products
    const viewedItems = await Product.find({ _id: { $in: viewedProducts } });
    const categories = [...new Set(viewedItems.map(p => p.category))];

    // Find products in same categories, excluding viewed ones
    const recommendations = await Product.find({
      _id: { $nin: viewedProducts },
      category: { $in: categories }
    })
    .sort({ rating: -1 })
    .limit(8);

    res.json(recommendations);
  } catch (err) {
    console.error('Error getting history-based recommendations:', err);
    res.status(500).json({ message: 'Error getting recommendations', error: err.message });
  }
});

module.exports = router;