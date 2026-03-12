const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists with this email or username' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName,
      preferences: {
        favoriteCategories: [],
        preferredBrands: [],
        priceRange: { min: 0, max: 10000 }
      },
      browsingHistory: [],
      purchaseHistory: [],
      cart: []
    });

    const newUser = await user.save();
    
    // Remove password from response
    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({ 
      message: 'User created successfully',
      user: userResponse
    });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(400).json({ message: 'Error creating user', error: err.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last active
    await user.updateLastActive();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ 
      message: 'Login successful',
      user: userResponse
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ message: 'Error logging in', error: err.message });
  }
});

// Get user profile by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('browsingHistory.productId')
      .populate('purchaseHistory.productId')
      .populate('cart.productId')
      .populate('savedRecommendations.productId')
      .select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ message: 'Error fetching user', error: err.message });
  }
});

// Update user profile
router.put('/:userId', async (req, res) => {
  try {
    const { fullName, preferences } = req.body;
    const updates = {};
    
    if (fullName) updates.fullName = fullName;
    if (preferences) updates.preferences = preferences;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(400).json({ message: 'Error updating profile', error: err.message });
  }
});

// Add to browsing history
router.post('/:userId/browse', async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.addToBrowsingHistory(productId);

    res.json({ message: 'Added to browsing history' });
  } catch (err) {
    console.error('Error adding to browsing history:', err);
    res.status(500).json({ message: 'Error updating browsing history', error: err.message });
  }
});

// Add to cart
router.post('/:userId/cart', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.addToCart(productId, quantity);

    // Return updated cart
    await user.populate('cart.productId');
    res.json({ 
      message: 'Added to cart',
      cart: user.cart 
    });
  } catch (err) {
    console.error('Error adding to cart:', err);
    res.status(500).json({ message: 'Error updating cart', error: err.message });
  }
});

// Remove from cart
router.delete('/:userId/cart/:productId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.cart = user.cart.filter(
      item => item.productId.toString() !== req.params.productId
    );
    await user.save();

    res.json({ 
      message: 'Removed from cart',
      cart: user.cart 
    });
  } catch (err) {
    console.error('Error removing from cart:', err);
    res.status(500).json({ message: 'Error updating cart', error: err.message });
  }
});

// Update user preferences
router.put('/:userId/preferences', async (req, res) => {
  try {
    const { favoriteCategories, preferredBrands, priceRange } = req.body;
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (favoriteCategories) user.preferences.favoriteCategories = favoriteCategories;
    if (preferredBrands) user.preferences.preferredBrands = preferredBrands;
    if (priceRange) user.preferences.priceRange = priceRange;

    await user.save();

    res.json({
      message: 'Preferences updated',
      preferences: user.preferences
    });
  } catch (err) {
    console.error('Error updating preferences:', err);
    res.status(500).json({ message: 'Error updating preferences', error: err.message });
  }
});

module.exports = router;