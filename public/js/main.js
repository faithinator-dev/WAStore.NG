/**
 * WaStore Client-Side JS
 * Handles Cart logic (localStorage) and Hybrid Checkout triggers.
 */

const Cart = {
  get: () => JSON.parse(localStorage.getItem('wastore_cart') || '[]'),
  
  save: (items) => {
    localStorage.setItem('wastore_cart', JSON.stringify(items));
    Cart.updateBadge();
  },
  
  updateBadge: () => {
    const items = Cart.get();
    const countBadge = document.getElementById('cart-count');
    if (countBadge) {
      const total = items.reduce((acc, i) => acc + i.quantity, 0);
      countBadge.innerText = total;
      // Show/hide badge if it's 0? (Optional, keeping it simple for now)
    }
  },

  getItemKey: (item) => {
    const variantStr = item.selectedVariants ? JSON.stringify(item.selectedVariants) : '';
    return `${item.productId}_${variantStr}`;
  },

  add: (product) => {
    let items = Cart.get();
    const productKey = Cart.getItemKey(product);
    
    const existing = items.find(i => Cart.getItemKey(i) === productKey);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({ ...product, quantity: 1 });
    }
    
    Cart.save(items);
    
    if (window.showToast) {
      showToast(`${product.name} added to cart! 🛍️`);
    }
    
    window.dispatchEvent(new CustomEvent('cartUpdated'));
  },
  
  remove: (itemKey) => {
    let items = Cart.get().filter(i => Cart.getItemKey(i) !== itemKey);
    Cart.save(items);
    window.dispatchEvent(new CustomEvent('cartUpdated'));

    if (items.length === 0 && window.location.pathname.endsWith('/cart')) {
      location.reload();
    }
  },

  updateQuantity: (itemKey, delta) => {
    let items = Cart.get();
    const item = items.find(i => Cart.getItemKey(i) === itemKey);
    if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
        return Cart.remove(itemKey);
      }
      Cart.save(items);
      window.dispatchEvent(new CustomEvent('cartUpdated'));
    }
  },
  
  clear: () => {
    localStorage.removeItem('wastore_cart');
    Cart.updateBadge();
  }
};

// Auto-hide flash messages & Init Cart Badge
document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();
  
  const flashes = document.querySelectorAll('.flash');
  flashes.forEach(f => {
    setTimeout(() => {
      f.style.opacity = '0';
      setTimeout(() => f.remove(), 500);
    }, 4000);
  });
});
