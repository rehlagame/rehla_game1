/**
 * Rehla IAP Bridge - Enhanced Version
 * هذا الملف يُضاف للموقع للتواصل مع تطبيق iOS
 * يعمل فقط داخل WebView ولا يؤثر على المتصفحات العادية
 */

(function() {
  'use strict';

  // متغيرات للتحكم والإعدادات
  const CONFIG = {
    DEBUG_MODE: false, // تفعيل وضع التصحيح
    INTERCEPT_ENABLED: true, // التحكم في اعتراض الدفعات
    SUPPORTED_PLATFORMS: ['ios'], // المنصات المدعومة
    TAP_DOMAINS: ['tap.company', 'api.tap.company', 'checkout.tap.company'],
    PAYMENT_ENDPOINTS: ['/payment', '/charge', '/checkout', '/api/payment/initiate-tap-payment'],
    USER_AGENT_CHECK: /iPhone|iPad|iPod/i,
    WEBKIT_CHECK: true // التحقق من WebKit
  };

  // سجل للعمليات لتجنب التكرار
  const transactionLog = new Map();
  
  // التحقق من البيئة
  const environment = {
    isIOS: () => /iPhone|iPad|iPod/i.test(navigator.userAgent),
    isAndroid: () => /Android/i.test(navigator.userAgent),
    isWebView: () => {
      // التحقق من WebView بطرق متعددة
      return (window.webkit?.messageHandlers?.RehlaIAP) ||
             (window.ReactNativeWebView) ||
             (window.RehlaWebView) ||
             (navigator.userAgent.includes('wv'));
    },
    isIOSWebView: () => {
      return environment.isIOS() && 
             CONFIG.WEBKIT_CHECK && 
             window.webkit?.messageHandlers?.RehlaIAP;
    },
    isSafari: () => {
      return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    }
  };

  // التحقق من وجود التطبيق والبيئة المناسبة
  const isIOSApp = () => {
    // تحقق متعدد المستويات
    const checks = {
      platform: environment.isIOS(),
      webview: environment.isWebView(),
      webkit: !!window.webkit?.messageHandlers?.RehlaIAP,
      bridge: !!window.RehlaIAPBridge
    };
    
    if (CONFIG.DEBUG_MODE) {
      console.log('Environment Checks:', checks);
    }
    
    return checks.platform && checks.webview && checks.webkit;
  };

  // نظام إدارة Callbacks محسّن
  const callbackManager = {
    callbacks: new Map(),
    timeouts: new Map(),
    
    register: function(type, callback, timeout = 30000) {
      const id = `${type}_${Date.now()}_${Math.random()}`;
      this.callbacks.set(id, callback);
      
      // إضافة timeout للحماية من التعليق
      const timeoutId = setTimeout(() => {
        this.cleanup(id);
        callback({ success: false, error: 'Operation timeout' });
      }, timeout);
      
      this.timeouts.set(id, timeoutId);
      return id;
    },
    
    execute: function(id, data) {
      const callback = this.callbacks.get(id);
      if (callback) {
        this.cleanup(id);
        callback(data);
      }
    },
    
    cleanup: function(id) {
      this.callbacks.delete(id);
      const timeoutId = this.timeouts.get(id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.timeouts.delete(id);
      }
    }
  };

  // كائن محسّن للتعامل مع المشتريات
  window.RehlaPayment = {
    // معلومات النظام
    info: {
      version: '2.0.0',
      platform: environment.isIOS() ? 'ios' : (environment.isAndroid() ? 'android' : 'web'),
      isWebView: environment.isWebView(),
      isSupported: isIOSApp()
    },

    // التحقق من توفر IAP
    isAvailable: function() {
      return isIOSApp() && window.RehlaIAPBridge;
    },

    // الحصول على قائمة المنتجات
    getProducts: function(callback) {
      if (!this.isAvailable()) {
        if (CONFIG.DEBUG_MODE) console.log('IAP not available for getProducts');
        callback([]);
        return;
      }

      const callbackId = callbackManager.register('products', callback);
      
      // حفظ callback مع ID
      window.handleIAPProducts = function(products) {
        callbackManager.execute(callbackId, products);
      };
      
      try {
        window.RehlaIAPBridge.getProducts();
      } catch (error) {
        console.error('Error calling getProducts:', error);
        callbackManager.execute(callbackId, []);
      }
    },

    // شراء منتج
    purchase: function(productId, callback) {
      if (!this.isAvailable()) {
        if (CONFIG.DEBUG_MODE) console.log('IAP not available for purchase');
        callback({ success: false, error: 'IAP not available' });
        return;
      }

      // التحقق من عدم وجود عملية شراء جارية
      if (transactionLog.has(productId)) {
        const lastTransaction = transactionLog.get(productId);
        if (Date.now() - lastTransaction < 5000) { // 5 ثواني
          callback({ success: false, error: 'Purchase already in progress' });
          return;
        }
      }
      
      transactionLog.set(productId, Date.now());
      const callbackId = callbackManager.register('purchase', callback);
      
      window.handleIAPPurchase = function(result) {
        transactionLog.delete(productId);
        callbackManager.execute(callbackId, result);
      };

      try {
        window.RehlaIAPBridge.requestPurchase(productId);
      } catch (error) {
        console.error('Error calling requestPurchase:', error);
        transactionLog.delete(productId);
        callbackManager.execute(callbackId, { 
          success: false, 
          error: 'Failed to initiate purchase' 
        });
      }
    },

    // استعادة المشتريات
    restorePurchases: function(callback) {
      if (!this.isAvailable()) {
        callback({ success: false, error: 'IAP not available' });
        return;
      }

      const callbackId = callbackManager.register('restore', callback);
      
      window.handleIAPRestore = function(result) {
        callbackManager.execute(callbackId, result);
      };

      try {
        window.RehlaIAPBridge.restorePurchases();
      } catch (error) {
        console.error('Error calling restorePurchases:', error);
        callbackManager.execute(callbackId, { 
          success: false, 
          error: 'Failed to restore purchases' 
        });
      }
    },

    // تحويل معرف المنتج من Tap إلى IAP - محدث للمنتجات الجديدة
    mapTapProductToIAP: function(tapProductId) {
      const mapping = {
        // معرفات ألعاب من الموقع -> معرفات IAP في التطبيق
        '1': 'com.rehlagame.game_1',      // لعبة واحدة - 1 KWD
        '2': 'com.rehlagame.game_2',      // لعبتين - 2 KWD  
        '5': 'com.rehlagame.game_5',      // 5 ألعاب - 4 KWD
        '10': 'com.rehlagame.game_10',    // 10 ألعاب - 8 KWD
        
        // معرفات بديلة محتملة
        'game_1': 'com.rehlagame.game_1',
        'game_2': 'com.rehlagame.game_2',
        'game_5': 'com.rehlagame.game_5',
        'game_10': 'com.rehlagame.game_10',
        
        // معرفات من النظام القديم (للتوافق)
        '1_game': 'com.rehlagame.game_1',
        '2_games': 'com.rehlagame.game_2',
        '5_games': 'com.rehlagame.game_5',
        '10_games': 'com.rehlagame.game_10'
      };
      
      return mapping[tapProductId] || tapProductId;
    },

    // دالة مساعدة لإظهار واجهة IAP
    showIAPInterface: function(options = {}) {
      const defaultOptions = {
        title: 'اختر باقة الشراء',
        message: 'الشراء متاح عبر متجر التطبيقات',
        showProducts: true
      };
      
      const opts = { ...defaultOptions, ...options };
      
      if (opts.showProducts) {
        this.getProducts(function(products) {
          if (products && products.length > 0) {
            // يمكن هنا إظهار واجهة مخصصة أو تمرير البيانات للموقع
            window.dispatchEvent(new CustomEvent('iapProductsReady', {
              detail: { products, options: opts }
            }));
          }
        });
      }
    }
  };

  // اعتراض محاولات الدفع عبر Tap (يعمل فقط في iOS WebView)
  if (isIOSApp() && CONFIG.INTERCEPT_ENABLED) {
    // حفظ النسخ الأصلية
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    // دالة مساعدة للتحقق من URL الدفع
    const isPaymentURL = (url) => {
      if (typeof url !== 'string') return false;
      
      const urlLower = url.toLowerCase();
      
      // التحقق من domains Tap
      const isTapDomain = CONFIG.TAP_DOMAINS.some(domain => 
        urlLower.includes(domain)
      );
      
      // التحقق من endpoints الدفع
      const isPaymentEndpoint = CONFIG.PAYMENT_ENDPOINTS.some(endpoint => 
        urlLower.includes(endpoint)
      );
      
      return isTapDomain || isPaymentEndpoint;
    };
    
    // دالة معالجة الدفع
    const handlePaymentInterception = async (url, options = {}) => {
      if (CONFIG.DEBUG_MODE) {
        console.log('Payment interception triggered for:', url);
      }
      
      let productInfo = null;
      
      // محاولة استخراج معلومات المنتج
      if (options.body) {
        try {
          let bodyData;
          
          if (typeof options.body === 'string') {
            bodyData = JSON.parse(options.body);
          } else if (options.body instanceof FormData) {
            // معالجة FormData
            bodyData = {};
            for (const [key, value] of options.body.entries()) {
              bodyData[key] = value;
            }
          }
          
          // البحث عن معرف المنتج في أماكن مختلفة
          productInfo = {
            productId: bodyData.productId || 
                      bodyData.product_id || 
                      bodyData.item_id || 
                      bodyData.sku || 
                      bodyData.package_id ||
                      bodyData.gamesInPackage, // من الموقع
            amount: bodyData.amount || bodyData.price,
            currency: bodyData.currency || 'KWD',
            gamesCount: bodyData.gamesInPackage || bodyData.games_count,
            metadata: bodyData.metadata || {}
          };
          
          // إذا كان gamesInPackage موجود، استخدمه كمعرف
          if (bodyData.gamesInPackage && !productInfo.productId) {
            productInfo.productId = bodyData.gamesInPackage.toString();
          }
          
        } catch (e) {
          console.error('Error parsing payment data:', e);
        }
      }
      
      // إذا وجدنا معلومات المنتج
      if (productInfo && productInfo.productId) {
        const iapProductId = window.RehlaPayment.mapTapProductToIAP(productInfo.productId);
        
        return new Promise((resolve, reject) => {
          window.RehlaPayment.purchase(iapProductId, function(result) {
            if (result.success) {
              // إرسال أحداث النجاح
              window.dispatchEvent(new CustomEvent('paymentSuccess', {
                detail: {
                  productId: iapProductId,
                  transactionId: result.transactionId,
                  originalProductId: productInfo.productId,
                  amount: productInfo.amount,
                  currency: productInfo.currency,
                  gamesCount: productInfo.gamesCount,
                  source: 'IAP'
                }
              }));
              
              // محاكاة استجابة ناجحة من Tap
              resolve(new Response(JSON.stringify({
                status: 'success',
                transaction_id: result.transactionId,
                message: 'Payment processed via IAP'
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              }));
            } else {
              // إرسال أحداث الفشل
              window.dispatchEvent(new CustomEvent('paymentFailed', {
                detail: { 
                  error: result.error,
                  productId: productInfo.productId,
                  source: 'IAP'
                }
              }));
              
              reject(new Error(result.error || 'IAP payment failed'));
            }
          });
        });
      } else {
        // إذا لم نجد معلومات المنتج، نعرض واجهة IAP
        window.RehlaPayment.showIAPInterface({
          reason: 'No product information found',
          originalURL: url
        });
        
        throw new Error('Payment must use In-App Purchase');
      }
    };
    
    // استبدال fetch
    window.fetch = async function(...args) {
      const [url, options = {}] = args;
      
      if (isPaymentURL(url)) {
        try {
          return await handlePaymentInterception(url, options);
        } catch (error) {
          // في حالة الفشل، نرجع Promise مرفوض
          return Promise.reject(error);
        }
      }
      
      // السماح بالطلبات الأخرى
      return originalFetch.apply(this, args);
    };

    // استبدال XMLHttpRequest أيضاً
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._requestURL = url;
      this._requestMethod = method;
      return originalXHROpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
      if (this._requestURL && isPaymentURL(this._requestURL)) {
        // معالجة مشابهة لـ fetch
        const fakeXHR = this;
        
        setTimeout(() => {
          fakeXHR.readyState = 4;
          fakeXHR.status = 0;
          fakeXHR.statusText = 'Payment redirected to IAP';
          
          if (fakeXHR.onreadystatechange) {
            fakeXHR.onreadystatechange();
          }
          
          if (fakeXHR.onerror) {
            fakeXHR.onerror(new Error('Payment must use IAP'));
          }
        }, 100);
        
        // عرض واجهة IAP
        window.RehlaPayment.showIAPInterface();
        return;
      }
      
      return originalXHRSend.apply(this, arguments);
    };

    // اعتراض النقرات على أزرار الدفع
    document.addEventListener('click', function(event) {
      const target = event.target;
      const button = target.closest('button, a, [role="button"]');
      
      if (!button) return;
      
      // التحقق من أزرار الدفع المختلفة
      const isPaymentButton = 
        button.id === 'pay-now-btn' || // زر الدفع في الموقع
        button.classList.contains('tap-pay-button') ||
        button.classList.contains('payment-button') ||
        button.classList.contains('pay-btn') ||
        button.classList.contains('checkout-btn') ||
        button.dataset.action === 'pay' ||
        button.dataset.payment === 'tap' ||
        (button.textContent && (
          button.textContent.includes('ادفع') ||
          button.textContent.includes('شراء') ||
          button.textContent.includes('Pay') ||
          button.textContent.includes('Buy')
        ));
      
      if (isPaymentButton) {
        event.preventDefault();
        event.stopPropagation();
        
        // البحث عن معلومات المنتج من العناصر المحددة في الموقع
        let productId = null;
        let gamesCount = null;
        
        // البحث عن الخيار المحدد في قائمة الشراء
        const selectedOption = document.querySelector('.purchase-option.selected');
        if (selectedOption) {
          gamesCount = selectedOption.dataset.games;
          productId = gamesCount; // استخدم عدد الألعاب كمعرف
        }
        
        // إذا لم نجد خيار محدد، ابحث في العناصر الأخرى
        if (!productId) {
          const productElement = button.closest('[data-product-id], [data-product], [data-item]');
          if (productElement) {
            productId = productElement.dataset.productId || 
                       productElement.dataset.product || 
                       productElement.dataset.item;
          }
        }
        
        if (productId) {
          const iapProductId = window.RehlaPayment.mapTapProductToIAP(productId);
          
          // إضافة تأثير بصري للزر
          button.disabled = true;
          const originalText = button.textContent;
          button.textContent = 'جاري المعالجة...';
          
          window.RehlaPayment.purchase(iapProductId, function(result) {
            button.disabled = false;
            button.textContent = originalText;
            
            if (result.success) {
              // إظهار رسالة نجاح
              alert(`تمت عملية الشراء بنجاح! تم إضافة ${gamesCount || ''} ${gamesCount == 1 ? 'لعبة' : 'ألعاب'} إلى رصيدك.`);
              
              // تحديث الصفحة بعد ثانية
              setTimeout(() => window.location.reload(), 1000);
            } else {
              alert('فشلت عملية الشراء: ' + (result.error || 'خطأ غير معروف'));
            }
          });
        } else {
          // إذا لم نجد معلومات المنتج، اعرض قائمة المنتجات
          window.RehlaPayment.showIAPInterface();
        }
      }
    }, true); // استخدام capture phase

    // إضافة رسالة تأكيد في Console
    if (CONFIG.DEBUG_MODE || !environment.isSafari()) {
      console.log(
        '%cRehla IAP Bridge Active (v' + window.RehlaPayment.info.version + ')',
        'color: #28a745; font-weight: bold; font-size: 14px;'
      );
      console.log('Platform:', window.RehlaPayment.info);
    }
  }

  // دالة مساعدة لتحديث واجهة المستخدم بناءً على المنصة
  window.RehlaPayment.updateUIForPlatform = function() {
    if (!this.isAvailable()) {
      // الموقع يعمل بشكل طبيعي في المتصفحات
      if (CONFIG.DEBUG_MODE) {
        console.log('Running in browser mode - Tap Payments active');
      }
      return;
    }
    
    // إخفاء خيارات Tap في iOS WebView
    const tapElements = document.querySelectorAll(
      '.tap-payment-option, .tap-payment-section, [data-payment-provider="tap"]'
    );
    
    tapElements.forEach(el => {
      el.style.display = 'none';
      // إضافة class للتحكم عبر CSS
      el.classList.add('hidden-in-ios-app');
    });
    
    // إضافة زر أو رسالة للمشتريات داخل التطبيق
    const paymentContainers = document.querySelectorAll(
      '.payment-container, .payment-options, .checkout-section, .purchase-dropdown-menu'
    );
    
    paymentContainers.forEach(container => {
      // التحقق من عدم إضافة الزر مسبقاً
      if (!container.querySelector('.iap-button') && !container.classList.contains('purchase-dropdown-menu')) {
        const iapNotice = document.createElement('div');
        iapNotice.className = 'iap-notice';
        iapNotice.innerHTML = `
          <p style="text-align: center; color: #17a2b8; margin: 10px 0;">
            <i class="fas fa-info-circle"></i>
            الدفع متاح عبر متجر التطبيقات
          </p>
          <button class="iap-button btn btn-primary" style="width: 100%; padding: 12px;">
            عرض خيارات الشراء
          </button>
        `;
        
        const iapButton = iapNotice.querySelector('.iap-button');
        iapButton.onclick = function() {
          window.RehlaPayment.getProducts(function(products) {
            if (products && products.length > 0) {
              // يمكن هنا عرض واجهة مخصصة
              console.log('Available IAP products:', products);
              
              // إرسال حدث للموقع
              window.dispatchEvent(new CustomEvent('iapProductsLoaded', {
                detail: { products }
              }));
            } else {
              alert('لا توجد منتجات متاحة حالياً');
            }
          });
        };
        
        container.appendChild(iapNotice);
      }
    });
    
    // إضافة CSS مخصص
    if (!document.getElementById('rehla-iap-styles')) {
      const style = document.createElement('style');
      style.id = 'rehla-iap-styles';
      style.textContent = `
        .hidden-in-ios-app { display: none !important; }
        .iap-notice { 
          background: #f0f9ff; 
          border: 1px solid #17a2b8; 
          border-radius: 8px; 
          padding: 15px; 
          margin: 15px 0;
        }
        .iap-button {
          background-color: #17a2b8;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        .iap-button:hover { background-color: #138496; }
        .iap-button:disabled { 
          background-color: #6c757d; 
          cursor: not-allowed; 
        }
      `;
      document.head.appendChild(style);
    }
  };

  // تشغيل تحديث واجهة المستخدم عند تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.RehlaPayment.updateUIForPlatform();
    });
  } else {
    window.RehlaPayment.updateUIForPlatform();
  }
  
  // مراقبة التغييرات الديناميكية في DOM
  if (window.MutationObserver) {
    const observer = new MutationObserver(function(mutations) {
      // إعادة تطبيق التحديثات عند إضافة عناصر جديدة
      let shouldUpdate = false;
      
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && // Element node
                (node.classList?.contains('payment-container') ||
                 node.querySelector?.('.payment-button'))) {
              shouldUpdate = true;
            }
          });
        }
      });
      
      if (shouldUpdate) {
        setTimeout(() => window.RehlaPayment.updateUIForPlatform(), 100);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

})();
