const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  fullName: {
    type: String,
    trim: true
  },
  preferences: {
    favoriteCategories: [String],
    preferredBrands: [String],
    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 10000 }
    }
  },
  browsingHistory: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    viewedAt: { type: Date, default: Date.now }
  }],
  purchaseHistory: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    purchasedAt: { type: Date, default: Date.now },
    price: Number,
    quantity: { type: Number, default: 1 }
  }],
  cart: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1, min: 1 },
    addedAt: { type: Date, default: Date.now }
  }],
  savedRecommendations: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    reason: String,
    date: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
});

// Update last active timestamp
userSchema.methods.updateLastActive = function() {
  this.lastActive = Date.now();
  return this.save();
};

// Add to browsing history
userSchema.methods.addToBrowsingHistory = function(productId) {
  this.browsingHistory.push({ productId, viewedAt: new Date() });
  // Keep only last 50 items
  if (this.browsingHistory.length > 50) {
    this.browsingHistory = this.browsingHistory.slice(-50);
  }
  return this.save();
};

// Add to cart
userSchema.methods.addToCart = function(productId, quantity = 1) {
  const existingItem = this.cart.find(item => 
    item.productId.toString() === productId.toString()
  );
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    this.cart.push({ productId, quantity });
  }
  return this.save();
};

module.exports = mongoose.model('User', userSchema);