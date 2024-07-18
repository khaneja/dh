// src/scripts/helpers/fetch-inject.js
var appendFileToHead = function(i, s, o, g, r, a, m) {
  a = s.createElement(o), m = s.getElementsByTagName(o)[0];
  a.type = g.blob.type.split(";")[0].trim();
  a.appendChild(s.createTextNode(g.text));
  a.onload = r(g);
  m ? m.parentNode.insertBefore(a, m) : s.head.appendChild(a);
};
function fetchInject(inputs, promise) {
  if (!(inputs && Array.isArray(inputs)))
    return Promise.reject(new Error("`inputs` must be an array"));
  if (promise && !(promise instanceof Promise))
    return Promise.reject(new Error("`promise` must be a promise"));
  const resources = [];
  const deferreds = promise ? [].concat(promise) : [];
  const thenables = [];
  inputs.forEach((input) => deferreds.push(
    window.fetch(input).then((res) => {
      return [res.clone().text(), res.blob()];
    }).then((promises) => {
      return Promise.all(promises).then((resolved) => {
        resources.push({ text: resolved[0], blob: resolved[1] });
      });
    })
  ));
  return Promise.all(deferreds).then(() => {
    resources.forEach((resource) => {
      thenables.push({ then: (resolve) => {
        resource.blob.type.split(";")[0].trim() === "text/css" ? appendFileToHead(window, document, "style", resource, resolve) : appendFileToHead(window, document, "script", resource, resolve);
      } });
    });
    return Promise.all(thenables);
  });
}
function loadScript(url) {
  return new Promise((resolve, reject) => {
    let script = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;
    script.addEventListener("load", () => resolve(script), false);
    script.addEventListener("error", () => reject(script), false);
    document.body.appendChild(script);
  });
}

// src/scripts/components/3d-model.js
if (!customElements.get("loess-3d-model")) {
  window.customElements.define("loess-3d-model", class extends HTMLElement {
    async connectedCallback() {
      await fetchInject([window.LoessTheme.styles.modelViewerUiStyles]);
      Shopify.loadFeatures([
        {
          name: "shopify-xr",
          version: "1.0",
          onLoad: this.setupShopifyXR.bind(this)
        },
        {
          name: "model-viewer-ui",
          version: "1.0",
          onLoad: () => {
            this.modelViewerUI = new Shopify.ModelViewerUI(this.querySelector("model-viewer"));
          }
        }
      ]);
    }
    disconnectedCallback() {
      this.modelViewerUI?.destroy();
    }
    setupShopifyXR(errors) {
      if (errors)
        return;
      if (!window.ShopifyXR) {
        document.addEventListener(
          "shopify_xr_initialized",
          () => this.setupShopifyXR()
        );
        return;
      }
      document.querySelectorAll('[id^="ProductJSON-"]').forEach((modelJSON) => {
        window.ShopifyXR.addModels(JSON.parse(modelJSON.textContent));
        modelJSON.remove();
      });
      window.ShopifyXR.setupXRElements();
    }
    play() {
      this.modelViewerUI?.play();
    }
    pause() {
      this.modelViewerUI?.pause();
    }
  });
}

// src/scripts/components/button.js
var Button = class extends HTMLButtonElement {
  constructor() {
    super();
    this.addEventListener("click", this._onClick.bind(this));
  }
  static get observedAttributes() {
    return ["aria-expanded"];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === "false" && newValue === "true") {
      this.target.open = true;
    } else if (oldValue === "true" && newValue === "false") {
      this.target.open = false;
    }
  }
  connectedCallback() {
    this.handleState = this._handleState.bind(this);
    document.addEventListener("expandable-html-element:open", this.handleState);
    document.addEventListener("expandable-html-element:close", this.handleState);
  }
  disconnectedCallback() {
    document.removeEventListener("expandable-html-element:open", this.handleState);
    document.removeEventListener("expandable-html-element:close", this.handleState);
  }
  _handleState(event) {
    if (this.target !== event.target)
      return;
    event.stopPropagation();
    if (event.type == "expandable-html-element:open") {
      this.expanded = true;
      if (this.targetFocus)
        this.targetFocus.focus();
    } else {
      this.expanded = false;
    }
  }
  get expanded() {
    return this.getAttribute("aria-expanded") === "true";
  }
  set expanded(value) {
    this.setAttribute("aria-expanded", String(value));
  }
  get target() {
    return document.getElementById(this.getAttribute("aria-controls"));
  }
  get targetFocus() {
    return document.getElementById(this.getAttribute("target-focus"));
  }
  _onClick() {
    this.expanded = !this.expanded;
  }
};
if (!customElements.get("loess-button")) {
  window.customElements.define("loess-button", Button, { extends: "button" });
}

// src/scripts/helpers/debounce.js
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

// src/scripts/helpers/fetch-config.js
function fetchConfig(type = "json") {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": `application/${type}` }
  };
}

// src/scripts/components/cart.js
if (!customElements.get("loess-cart-notes")) {
  customElements.define("loess-cart-notes", class extends HTMLTextAreaElement {
    constructor() {
      super();
      this.addEventListener("input", debounce((event) => {
        const body = JSON.stringify({ note: event.target.value });
        fetch(`${window.LoessTheme.routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
      }));
    }
  }, { extends: "textarea" });
}
if (!customElements.get("loess-cart-remove-button")) {
  customElements.define("loess-cart-remove-button", class extends HTMLElement {
    constructor() {
      super();
      this.addEventListener("click", (event) => {
        event.preventDefault();
        const cartItems = this.closest("loess-cart-items") || this.closest("loess-cart-drawer-items");
        cartItems.updateQuantity(this.dataset.index, 0);
      }, { once: true });
    }
  });
}
var CartItems = class extends HTMLElement {
  constructor() {
    super();
    this.currentItemCount = Array.from(this.querySelectorAll('[name="updates[]"]')).reduce((total, quantityInput) => total + parseInt(quantityInput.value), 0);
    this.debouncedOnChange = debounce((event) => {
      if (event.target.name === "note" || event.target.name.startsWith("attributes"))
        return;
      this.onChange(event);
    });
    this.addEventListener("change", this.debouncedOnChange.bind(this));
  }
  onChange(event) {
    this.updateQuantity(event.target.dataset.index, event.target.value, document.activeElement.getAttribute("name"));
  }
  getSectionsToRender() {
    return [
      {
        id: "MainCartItems",
        section: document.getElementById("MainCartItems").dataset.id,
        selector: ".cart-items"
      },
      {
        id: "MainCartItems",
        section: document.getElementById("MainCartItems").dataset.id,
        selector: ".cart-payment-terms"
      },
      {
        id: "CartTotalPrice",
        section: "cart-total-price",
        selector: ".shopify-section"
      },
      {
        id: "HeaderCartIcon",
        section: "header-cart-icon",
        selector: ".shopify-section"
      },
      {
        id: "FreeShippingTextMobile",
        section: "free-shipping-text",
        selector: ".shopify-section"
      },
      {
        id: "FreeShippingTextLarge",
        section: "free-shipping-text",
        selector: ".shopify-section"
      }
    ];
  }
  updateQuantity(line, quantity, name) {
    this.enableLoading(line);
    document.querySelector(".cart-errors")?.classList.remove("cart-errors--visible");
    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname
    });
    fetch(`${window.LoessTheme.routes.cart_change_url}`, { ...fetchConfig(), ...{ body } }).then((response) => {
      return response.json();
    }).then((state) => {
      this.renderCartItems(state);
      this.disableLoading();
    }).catch(() => {
      this.querySelectorAll(".loading-overlay").forEach((overlay) => overlay.classList.add("hidden"));
      document.querySelector(".cart-errors").classList.add("cart-errors--visible");
      document.querySelector(".cart-errors > span").textContent = window.LoessTheme.cartStrings.error;
      this.disableLoading();
    });
  }
  renderCartItems(state) {
    const parsedState = state;
    this.classList.toggle("is-empty", parsedState.item_count === 0);
    this.parentElement.nextElementSibling?.classList.toggle("hide", parsedState.item_count === 0);
    this.renderHTML(parsedState);
    this.dispatchCartUpdatedEvent(parsedState);
  }
  renderHTML(parsedState) {
    this.getSectionsToRender().forEach((section) => {
      const elementToReplace = document.getElementById(section.id)?.querySelector(section.selector) || document.getElementById(section.id);
      if (!elementToReplace)
        return;
      const parsedHTML = new DOMParser().parseFromString(parsedState.sections[section.section], "text/html").querySelector(section.selector);
      if (!parsedHTML)
        return;
      elementToReplace.innerHTML = parsedHTML.innerHTML;
    });
  }
  dispatchCartUpdatedEvent(parsedState) {
    document.documentElement.dispatchEvent(new CustomEvent("cart:updated", {
      bubbles: true,
      detail: {
        cart: parsedState
      }
    }));
  }
  updateLiveRegions(line, itemCount) {
    if (this.currentItemCount === itemCount) {
      document.getElementById(`Line-item-error-${line}`).querySelector(".cart-item__error-text").innerHTML = window.LoessTheme.cartStrings.quantityError.replace(
        "[quantity]",
        document.getElementById(`Quantity-${line}`).value
      );
    }
    this.currentItemCount = itemCount;
    const cartStatus = document.getElementById("cart-live-region-text");
    cartStatus.setAttribute("aria-hidden", false);
    setTimeout(() => {
      cartStatus.setAttribute("aria-hidden", true);
    }, 1e3);
  }
  enableLoading(line) {
    document.getElementById("MainCartItems").classList.add("cart__items--disabled");
    this.querySelectorAll(`#CartItem-${line} .loading-overlay`).forEach((overlay) => overlay.classList.remove("hidden"));
    document.activeElement.blur();
  }
  disableLoading() {
    document.getElementById("MainCartItems").classList.remove("cart__items--disabled");
  }
};
if (!customElements.get("loess-cart-items")) {
  customElements.define("loess-cart-items", CartItems);
}
var CartDrawerItems = class extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: "MainCartItems",
        section: "cart-drawer-items",
        selector: ".cart-items"
      },
      {
        id: "HeaderCartIcon",
        section: "header-cart-icon",
        selector: ".shopify-section"
      },
      {
        id: "FreeShippingText",
        section: "free-shipping-text",
        selector: ".shopify-section"
      },
      {
        id: "CartDrawerTotalPrice",
        section: "cart-total-price",
        selector: ".shopify-section"
      }
    ];
  }
};
if (!customElements.get("loess-cart-drawer-items")) {
  customElements.define("loess-cart-drawer-items", CartDrawerItems);
}
var CartNotification = class extends CartItems {
  renderCartItems(state) {
    this.cartItemKey = state.key;
    this.renderHTML(state);
    this.dispatchCartUpdatedEvent(state);
  }
  getSectionsToRender() {
    return [
      {
        id: "HeaderCartIcon",
        section: "header-cart-icon",
        selector: ".shopify-section"
      },
      {
        id: "CartNotificationButton",
        section: "cart-notification-button",
        selector: ".shopify-section"
      },
      {
        id: "CartNotificationProduct",
        section: "cart-notification-product",
        selector: `[id="CartNotificationProduct-${this.cartItemKey}"]`
      },
      {
        id: "FreeShippingText",
        section: "free-shipping-text",
        selector: ".shopify-section"
      }
    ];
  }
};
if (!customElements.get("loess-cart-notification")) {
  customElements.define("loess-cart-notification", CartNotification);
}
if (!customElements.get("loess-cart-drawer-checkout")) {
  window.customElements.define("loess-cart-drawer-checkout", class extends HTMLElement {
    constructor() {
      super();
      this.parentElement.addEventListener("click", this.redirect.bind(this));
    }
    redirect() {
      this.parentElement.nextElementSibling.classList.remove("hide");
      this.parentElement.remove();
    }
  });
}
if (!customElements.get("loess-cart-recommendations")) {
  window.customElements.define("loess-cart-recommendations", class extends HTMLElement {
    constructor() {
      super();
      if (!this.productId)
        return;
      this.initProductRecommendations();
    }
    connectedCallback() {
      document.documentElement.addEventListener("cart:updated", (event) => {
        this.updateProductId(event);
        this.initProductRecommendations();
      });
    }
    async initProductRecommendations() {
      const response = await fetch(this.buildQueryString());
      const text = await response.text();
      this.injectHTMLResponse(text);
    }
    updateProductId(event) {
      this.setAttribute("product-id", event.detail.cart.product_id || event.detail.cart.items[0]?.product_id || this.productId);
    }
    buildQueryString() {
      return `${window.LoessTheme.routes.product_recommendations_url}?section_id=cart-drawer-recommendations&product_id=${this.productId}&limit=${this.limit}`;
    }
    injectHTMLResponse(text) {
      const div = document.createElement("div");
      div.innerHTML = text;
      const productRecommendations = div.querySelector(".shopify-section");
      if (productRecommendations && productRecommendations.innerHTML.trim().length) {
        this.querySelector("ul")?.remove();
        this.insertAdjacentHTML("beforeend", productRecommendations.innerHTML);
      }
    }
    get productId() {
      return this.getAttribute("product-id");
    }
    get limit() {
      return this.getAttribute("limit");
    }
  });
}

// src/scripts/mixins/sticky-scroll.js
var StickyScrollMixin = {
  setupStickyScroll(element) {
    this.getInitialValues(element);
    this.checkPosition = this.checkPosition.bind(this);
    window.addEventListener("scroll", this.checkPosition);
  },
  destroyStickyScroll() {
    window.removeEventListener("scroll", this.checkPosition);
  },
  getInitialValues(element) {
    this.element = element;
    this.lastKnownY = window.scrollY;
    this.currentTop = 0;
    this.pendingRaf = false;
    this.stickyHeaderOffset = this.getStickyHeaderOffset();
  },
  checkPosition() {
    if (this.pendingRaf)
      return;
    this.pendingRaf = true;
    requestAnimationFrame(() => {
      const { top } = this.element.getBoundingClientRect();
      const maxTop = top + window.scrollY - this.element.offsetTop + this.getTopOffset();
      const minTop = this.element.clientHeight - window.innerHeight + 30;
      if (window.scrollY < this.lastKnownY) {
        this.currentTop -= window.scrollY - this.lastKnownY;
      } else {
        this.currentTop += this.lastKnownY - window.scrollY;
      }
      this.lastKnownY = window.scrollY;
      this.currentTop = Math.min(Math.max(this.currentTop, -minTop), maxTop, this.getTopOffset());
      this.element.style.top = `${this.currentTop}px`;
      this.pendingRaf = false;
    });
  },
  getTopOffset() {
    return this.stickyHeaderOffset + 30;
  },
  getStickyHeaderOffset() {
    const documentStyles = getComputedStyle(document.documentElement);
    return parseInt(documentStyles.getPropertyValue("--header-height") || 0) * parseInt(documentStyles.getPropertyValue("--enable-sticky-header") || 0);
  }
};

// src/scripts/components/cart-blocks.js
var LoessCartBlocks = class extends HTMLElement {
  constructor() {
    super();
    this.setupStickyScroll(this);
  }
};
Object.assign(LoessCartBlocks.prototype, StickyScrollMixin);
if (!customElements.get("loess-cart-blocks")) {
  window.customElements.define("loess-cart-blocks", LoessCartBlocks);
}

// node_modules/tabbable/dist/index.esm.js
var candidateSelectors = ["input", "select", "textarea", "a[href]", "button", "[tabindex]:not(slot)", "audio[controls]", "video[controls]", '[contenteditable]:not([contenteditable="false"])', "details>summary:first-of-type", "details"];
var candidateSelector = /* @__PURE__ */ candidateSelectors.join(",");
var NoElement = typeof Element === "undefined";
var matches = NoElement ? function() {
} : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
var getRootNode = !NoElement && Element.prototype.getRootNode ? function(element) {
  return element.getRootNode();
} : function(element) {
  return element.ownerDocument;
};
var getCandidates = function getCandidates2(el, includeContainer, filter) {
  var candidates = Array.prototype.slice.apply(el.querySelectorAll(candidateSelector));
  if (includeContainer && matches.call(el, candidateSelector)) {
    candidates.unshift(el);
  }
  candidates = candidates.filter(filter);
  return candidates;
};
var getCandidatesIteratively = function getCandidatesIteratively2(elements, includeContainer, options) {
  var candidates = [];
  var elementsToCheck = Array.from(elements);
  while (elementsToCheck.length) {
    var element = elementsToCheck.shift();
    if (element.tagName === "SLOT") {
      var assigned = element.assignedElements();
      var content = assigned.length ? assigned : element.children;
      var nestedCandidates = getCandidatesIteratively2(content, true, options);
      if (options.flatten) {
        candidates.push.apply(candidates, nestedCandidates);
      } else {
        candidates.push({
          scope: element,
          candidates: nestedCandidates
        });
      }
    } else {
      var validCandidate = matches.call(element, candidateSelector);
      if (validCandidate && options.filter(element) && (includeContainer || !elements.includes(element))) {
        candidates.push(element);
      }
      var shadowRoot = element.shadowRoot || typeof options.getShadowRoot === "function" && options.getShadowRoot(element);
      var validShadowRoot = !options.shadowRootFilter || options.shadowRootFilter(element);
      if (shadowRoot && validShadowRoot) {
        var _nestedCandidates = getCandidatesIteratively2(shadowRoot === true ? element.children : shadowRoot.children, true, options);
        if (options.flatten) {
          candidates.push.apply(candidates, _nestedCandidates);
        } else {
          candidates.push({
            scope: element,
            candidates: _nestedCandidates
          });
        }
      } else {
        elementsToCheck.unshift.apply(elementsToCheck, element.children);
      }
    }
  }
  return candidates;
};
var getTabindex = function getTabindex2(node, isScope) {
  if (node.tabIndex < 0) {
    if ((isScope || /^(AUDIO|VIDEO|DETAILS)$/.test(node.tagName) || node.isContentEditable) && isNaN(parseInt(node.getAttribute("tabindex"), 10))) {
      return 0;
    }
  }
  return node.tabIndex;
};
var sortOrderedTabbables = function sortOrderedTabbables2(a, b) {
  return a.tabIndex === b.tabIndex ? a.documentOrder - b.documentOrder : a.tabIndex - b.tabIndex;
};
var isInput = function isInput2(node) {
  return node.tagName === "INPUT";
};
var isHiddenInput = function isHiddenInput2(node) {
  return isInput(node) && node.type === "hidden";
};
var isDetailsWithSummary = function isDetailsWithSummary2(node) {
  var r = node.tagName === "DETAILS" && Array.prototype.slice.apply(node.children).some(function(child) {
    return child.tagName === "SUMMARY";
  });
  return r;
};
var getCheckedRadio = function getCheckedRadio2(nodes, form) {
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].checked && nodes[i].form === form) {
      return nodes[i];
    }
  }
};
var isTabbableRadio = function isTabbableRadio2(node) {
  if (!node.name) {
    return true;
  }
  var radioScope = node.form || getRootNode(node);
  var queryRadios = function queryRadios2(name) {
    return radioScope.querySelectorAll('input[type="radio"][name="' + name + '"]');
  };
  var radioSet;
  if (typeof window !== "undefined" && typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function") {
    radioSet = queryRadios(window.CSS.escape(node.name));
  } else {
    try {
      radioSet = queryRadios(node.name);
    } catch (err) {
      console.error("Looks like you have a radio button with a name attribute containing invalid CSS selector characters and need the CSS.escape polyfill: %s", err.message);
      return false;
    }
  }
  var checked = getCheckedRadio(radioSet, node.form);
  return !checked || checked === node;
};
var isRadio = function isRadio2(node) {
  return isInput(node) && node.type === "radio";
};
var isNonTabbableRadio = function isNonTabbableRadio2(node) {
  return isRadio(node) && !isTabbableRadio(node);
};
var isZeroArea = function isZeroArea2(node) {
  var _node$getBoundingClie = node.getBoundingClientRect(), width = _node$getBoundingClie.width, height = _node$getBoundingClie.height;
  return width === 0 && height === 0;
};
var isHidden = function isHidden2(node, _ref) {
  var displayCheck = _ref.displayCheck, getShadowRoot = _ref.getShadowRoot;
  if (getComputedStyle(node).visibility === "hidden") {
    return true;
  }
  var isDirectSummary = matches.call(node, "details>summary:first-of-type");
  var nodeUnderDetails = isDirectSummary ? node.parentElement : node;
  if (matches.call(nodeUnderDetails, "details:not([open]) *")) {
    return true;
  }
  var nodeRootHost = getRootNode(node).host;
  var nodeIsAttached = (nodeRootHost === null || nodeRootHost === void 0 ? void 0 : nodeRootHost.ownerDocument.contains(nodeRootHost)) || node.ownerDocument.contains(node);
  if (!displayCheck || displayCheck === "full") {
    if (typeof getShadowRoot === "function") {
      var originalNode = node;
      while (node) {
        var parentElement = node.parentElement;
        var rootNode = getRootNode(node);
        if (parentElement && !parentElement.shadowRoot && getShadowRoot(parentElement) === true) {
          return isZeroArea(node);
        } else if (node.assignedSlot) {
          node = node.assignedSlot;
        } else if (!parentElement && rootNode !== node.ownerDocument) {
          node = rootNode.host;
        } else {
          node = parentElement;
        }
      }
      node = originalNode;
    }
    if (nodeIsAttached) {
      return !node.getClientRects().length;
    }
  } else if (displayCheck === "non-zero-area") {
    return isZeroArea(node);
  }
  return false;
};
var isDisabledFromFieldset = function isDisabledFromFieldset2(node) {
  if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(node.tagName)) {
    var parentNode = node.parentElement;
    while (parentNode) {
      if (parentNode.tagName === "FIELDSET" && parentNode.disabled) {
        for (var i = 0; i < parentNode.children.length; i++) {
          var child = parentNode.children.item(i);
          if (child.tagName === "LEGEND") {
            return matches.call(parentNode, "fieldset[disabled] *") ? true : !child.contains(node);
          }
        }
        return true;
      }
      parentNode = parentNode.parentElement;
    }
  }
  return false;
};
var isNodeMatchingSelectorFocusable = function isNodeMatchingSelectorFocusable2(options, node) {
  if (node.disabled || isHiddenInput(node) || isHidden(node, options) || isDetailsWithSummary(node) || isDisabledFromFieldset(node)) {
    return false;
  }
  return true;
};
var isNodeMatchingSelectorTabbable = function isNodeMatchingSelectorTabbable2(options, node) {
  if (isNonTabbableRadio(node) || getTabindex(node) < 0 || !isNodeMatchingSelectorFocusable(options, node)) {
    return false;
  }
  return true;
};
var isValidShadowRootTabbable = function isValidShadowRootTabbable2(shadowHostNode) {
  var tabIndex = parseInt(shadowHostNode.getAttribute("tabindex"), 10);
  if (isNaN(tabIndex) || tabIndex >= 0) {
    return true;
  }
  return false;
};
var sortByOrder = function sortByOrder2(candidates) {
  var regularTabbables = [];
  var orderedTabbables = [];
  candidates.forEach(function(item, i) {
    var isScope = !!item.scope;
    var element = isScope ? item.scope : item;
    var candidateTabindex = getTabindex(element, isScope);
    var elements = isScope ? sortByOrder2(item.candidates) : element;
    if (candidateTabindex === 0) {
      isScope ? regularTabbables.push.apply(regularTabbables, elements) : regularTabbables.push(element);
    } else {
      orderedTabbables.push({
        documentOrder: i,
        tabIndex: candidateTabindex,
        item,
        isScope,
        content: elements
      });
    }
  });
  return orderedTabbables.sort(sortOrderedTabbables).reduce(function(acc, sortable) {
    sortable.isScope ? acc.push.apply(acc, sortable.content) : acc.push(sortable.content);
    return acc;
  }, []).concat(regularTabbables);
};
var tabbable = function tabbable2(el, options) {
  options = options || {};
  var candidates;
  if (options.getShadowRoot) {
    candidates = getCandidatesIteratively([el], options.includeContainer, {
      filter: isNodeMatchingSelectorTabbable.bind(null, options),
      flatten: false,
      getShadowRoot: options.getShadowRoot,
      shadowRootFilter: isValidShadowRootTabbable
    });
  } else {
    candidates = getCandidates(el, options.includeContainer, isNodeMatchingSelectorTabbable.bind(null, options));
  }
  return sortByOrder(candidates);
};
var focusable = function focusable2(el, options) {
  options = options || {};
  var candidates;
  if (options.getShadowRoot) {
    candidates = getCandidatesIteratively([el], options.includeContainer, {
      filter: isNodeMatchingSelectorFocusable.bind(null, options),
      flatten: true,
      getShadowRoot: options.getShadowRoot
    });
  } else {
    candidates = getCandidates(el, options.includeContainer, isNodeMatchingSelectorFocusable.bind(null, options));
  }
  return candidates;
};
var isTabbable = function isTabbable2(node, options) {
  options = options || {};
  if (!node) {
    throw new Error("No node provided");
  }
  if (matches.call(node, candidateSelector) === false) {
    return false;
  }
  return isNodeMatchingSelectorTabbable(options, node);
};
var focusableCandidateSelector = /* @__PURE__ */ candidateSelectors.concat("iframe").join(",");
var isFocusable = function isFocusable2(node, options) {
  options = options || {};
  if (!node) {
    throw new Error("No node provided");
  }
  if (matches.call(node, focusableCandidateSelector) === false) {
    return false;
  }
  return isNodeMatchingSelectorFocusable(options, node);
};

// node_modules/focus-trap/dist/focus-trap.esm.js
function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    enumerableOnly && (symbols = symbols.filter(function(sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    })), keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = null != arguments[i] ? arguments[i] : {};
    i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
      _defineProperty(target, key, source[key]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    });
  }
  return target;
}
function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
var activeFocusTraps = function() {
  var trapQueue = [];
  return {
    activateTrap: function activateTrap(trap) {
      if (trapQueue.length > 0) {
        var activeTrap = trapQueue[trapQueue.length - 1];
        if (activeTrap !== trap) {
          activeTrap.pause();
        }
      }
      var trapIndex = trapQueue.indexOf(trap);
      if (trapIndex === -1) {
        trapQueue.push(trap);
      } else {
        trapQueue.splice(trapIndex, 1);
        trapQueue.push(trap);
      }
    },
    deactivateTrap: function deactivateTrap(trap) {
      var trapIndex = trapQueue.indexOf(trap);
      if (trapIndex !== -1) {
        trapQueue.splice(trapIndex, 1);
      }
      if (trapQueue.length > 0) {
        trapQueue[trapQueue.length - 1].unpause();
      }
    }
  };
}();
var isSelectableInput = function isSelectableInput2(node) {
  return node.tagName && node.tagName.toLowerCase() === "input" && typeof node.select === "function";
};
var isEscapeEvent = function isEscapeEvent2(e) {
  return e.key === "Escape" || e.key === "Esc" || e.keyCode === 27;
};
var isTabEvent = function isTabEvent2(e) {
  return e.key === "Tab" || e.keyCode === 9;
};
var delay = function delay2(fn) {
  return setTimeout(fn, 0);
};
var findIndex = function findIndex2(arr, fn) {
  var idx = -1;
  arr.every(function(value, i) {
    if (fn(value)) {
      idx = i;
      return false;
    }
    return true;
  });
  return idx;
};
var valueOrHandler = function valueOrHandler2(value) {
  for (var _len = arguments.length, params = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    params[_key - 1] = arguments[_key];
  }
  return typeof value === "function" ? value.apply(void 0, params) : value;
};
var getActualTarget = function getActualTarget2(event) {
  return event.target.shadowRoot && typeof event.composedPath === "function" ? event.composedPath()[0] : event.target;
};
var createFocusTrap = function createFocusTrap2(elements, userOptions) {
  var doc = (userOptions === null || userOptions === void 0 ? void 0 : userOptions.document) || document;
  var config = _objectSpread2({
    returnFocusOnDeactivate: true,
    escapeDeactivates: true,
    delayInitialFocus: true
  }, userOptions);
  var state = {
    containers: [],
    containerGroups: [],
    tabbableGroups: [],
    nodeFocusedBeforeActivation: null,
    mostRecentlyFocusedNode: null,
    active: false,
    paused: false,
    delayInitialFocusTimer: void 0
  };
  var trap;
  var getOption = function getOption2(configOverrideOptions, optionName, configOptionName) {
    return configOverrideOptions && configOverrideOptions[optionName] !== void 0 ? configOverrideOptions[optionName] : config[configOptionName || optionName];
  };
  var findContainerIndex = function findContainerIndex2(element) {
    return state.containerGroups.findIndex(function(_ref) {
      var container = _ref.container, tabbableNodes = _ref.tabbableNodes;
      return container.contains(element) || tabbableNodes.find(function(node) {
        return node === element;
      });
    });
  };
  var getNodeForOption = function getNodeForOption2(optionName) {
    var optionValue = config[optionName];
    if (typeof optionValue === "function") {
      for (var _len2 = arguments.length, params = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        params[_key2 - 1] = arguments[_key2];
      }
      optionValue = optionValue.apply(void 0, params);
    }
    if (optionValue === true) {
      optionValue = void 0;
    }
    if (!optionValue) {
      if (optionValue === void 0 || optionValue === false) {
        return optionValue;
      }
      throw new Error("`".concat(optionName, "` was specified but was not a node, or did not return a node"));
    }
    var node = optionValue;
    if (typeof optionValue === "string") {
      node = doc.querySelector(optionValue);
      if (!node) {
        throw new Error("`".concat(optionName, "` as selector refers to no known node"));
      }
    }
    return node;
  };
  var getInitialFocusNode = function getInitialFocusNode2() {
    var node = getNodeForOption("initialFocus");
    if (node === false) {
      return false;
    }
    if (node === void 0) {
      if (findContainerIndex(doc.activeElement) >= 0) {
        node = doc.activeElement;
      } else {
        var firstTabbableGroup = state.tabbableGroups[0];
        var firstTabbableNode = firstTabbableGroup && firstTabbableGroup.firstTabbableNode;
        node = firstTabbableNode || getNodeForOption("fallbackFocus");
      }
    }
    if (!node) {
      throw new Error("Your focus-trap needs to have at least one focusable element");
    }
    return node;
  };
  var updateTabbableNodes = function updateTabbableNodes2() {
    state.containerGroups = state.containers.map(function(container) {
      var tabbableNodes = tabbable(container, config.tabbableOptions);
      var focusableNodes = focusable(container, config.tabbableOptions);
      return {
        container,
        tabbableNodes,
        focusableNodes,
        firstTabbableNode: tabbableNodes.length > 0 ? tabbableNodes[0] : null,
        lastTabbableNode: tabbableNodes.length > 0 ? tabbableNodes[tabbableNodes.length - 1] : null,
        nextTabbableNode: function nextTabbableNode(node) {
          var forward = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : true;
          var nodeIdx = focusableNodes.findIndex(function(n) {
            return n === node;
          });
          if (nodeIdx < 0) {
            return void 0;
          }
          if (forward) {
            return focusableNodes.slice(nodeIdx + 1).find(function(n) {
              return isTabbable(n, config.tabbableOptions);
            });
          }
          return focusableNodes.slice(0, nodeIdx).reverse().find(function(n) {
            return isTabbable(n, config.tabbableOptions);
          });
        }
      };
    });
    state.tabbableGroups = state.containerGroups.filter(function(group) {
      return group.tabbableNodes.length > 0;
    });
    if (state.tabbableGroups.length <= 0 && !getNodeForOption("fallbackFocus")) {
      throw new Error("Your focus-trap must have at least one container with at least one tabbable node in it at all times");
    }
  };
  var tryFocus = function tryFocus2(node) {
    if (node === false) {
      return;
    }
    if (node === doc.activeElement) {
      return;
    }
    if (!node || !node.focus) {
      tryFocus2(getInitialFocusNode());
      return;
    }
    node.focus({
      preventScroll: !!config.preventScroll
    });
    state.mostRecentlyFocusedNode = node;
    if (isSelectableInput(node)) {
      node.select();
    }
  };
  var getReturnFocusNode = function getReturnFocusNode2(previousActiveElement) {
    var node = getNodeForOption("setReturnFocus", previousActiveElement);
    return node ? node : node === false ? false : previousActiveElement;
  };
  var checkPointerDown = function checkPointerDown2(e) {
    var target = getActualTarget(e);
    if (findContainerIndex(target) >= 0) {
      return;
    }
    if (valueOrHandler(config.clickOutsideDeactivates, e)) {
      trap.deactivate({
        returnFocus: config.returnFocusOnDeactivate && !isFocusable(target, config.tabbableOptions)
      });
      return;
    }
    if (valueOrHandler(config.allowOutsideClick, e)) {
      return;
    }
    e.preventDefault();
  };
  var checkFocusIn = function checkFocusIn2(e) {
    var target = getActualTarget(e);
    var targetContained = findContainerIndex(target) >= 0;
    if (targetContained || target instanceof Document) {
      if (targetContained) {
        state.mostRecentlyFocusedNode = target;
      }
    } else {
      e.stopImmediatePropagation();
      tryFocus(state.mostRecentlyFocusedNode || getInitialFocusNode());
    }
  };
  var checkTab = function checkTab2(e) {
    var target = getActualTarget(e);
    updateTabbableNodes();
    var destinationNode = null;
    if (state.tabbableGroups.length > 0) {
      var containerIndex = findContainerIndex(target);
      var containerGroup = containerIndex >= 0 ? state.containerGroups[containerIndex] : void 0;
      if (containerIndex < 0) {
        if (e.shiftKey) {
          destinationNode = state.tabbableGroups[state.tabbableGroups.length - 1].lastTabbableNode;
        } else {
          destinationNode = state.tabbableGroups[0].firstTabbableNode;
        }
      } else if (e.shiftKey) {
        var startOfGroupIndex = findIndex(state.tabbableGroups, function(_ref2) {
          var firstTabbableNode = _ref2.firstTabbableNode;
          return target === firstTabbableNode;
        });
        if (startOfGroupIndex < 0 && (containerGroup.container === target || isFocusable(target, config.tabbableOptions) && !isTabbable(target, config.tabbableOptions) && !containerGroup.nextTabbableNode(target, false))) {
          startOfGroupIndex = containerIndex;
        }
        if (startOfGroupIndex >= 0) {
          var destinationGroupIndex = startOfGroupIndex === 0 ? state.tabbableGroups.length - 1 : startOfGroupIndex - 1;
          var destinationGroup = state.tabbableGroups[destinationGroupIndex];
          destinationNode = destinationGroup.lastTabbableNode;
        }
      } else {
        var lastOfGroupIndex = findIndex(state.tabbableGroups, function(_ref3) {
          var lastTabbableNode = _ref3.lastTabbableNode;
          return target === lastTabbableNode;
        });
        if (lastOfGroupIndex < 0 && (containerGroup.container === target || isFocusable(target, config.tabbableOptions) && !isTabbable(target, config.tabbableOptions) && !containerGroup.nextTabbableNode(target))) {
          lastOfGroupIndex = containerIndex;
        }
        if (lastOfGroupIndex >= 0) {
          var _destinationGroupIndex = lastOfGroupIndex === state.tabbableGroups.length - 1 ? 0 : lastOfGroupIndex + 1;
          var _destinationGroup = state.tabbableGroups[_destinationGroupIndex];
          destinationNode = _destinationGroup.firstTabbableNode;
        }
      }
    } else {
      destinationNode = getNodeForOption("fallbackFocus");
    }
    if (destinationNode) {
      e.preventDefault();
      tryFocus(destinationNode);
    }
  };
  var checkKey = function checkKey2(e) {
    if (isEscapeEvent(e) && valueOrHandler(config.escapeDeactivates, e) !== false) {
      e.preventDefault();
      trap.deactivate();
      return;
    }
    if (isTabEvent(e)) {
      checkTab(e);
      return;
    }
  };
  var checkClick = function checkClick2(e) {
    var target = getActualTarget(e);
    if (findContainerIndex(target) >= 0) {
      return;
    }
    if (valueOrHandler(config.clickOutsideDeactivates, e)) {
      return;
    }
    if (valueOrHandler(config.allowOutsideClick, e)) {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  var addListeners = function addListeners2() {
    if (!state.active) {
      return;
    }
    activeFocusTraps.activateTrap(trap);
    state.delayInitialFocusTimer = config.delayInitialFocus ? delay(function() {
      tryFocus(getInitialFocusNode());
    }) : tryFocus(getInitialFocusNode());
    doc.addEventListener("focusin", checkFocusIn, true);
    doc.addEventListener("mousedown", checkPointerDown, {
      capture: true,
      passive: false
    });
    doc.addEventListener("touchstart", checkPointerDown, {
      capture: true,
      passive: false
    });
    doc.addEventListener("click", checkClick, {
      capture: true,
      passive: false
    });
    doc.addEventListener("keydown", checkKey, {
      capture: true,
      passive: false
    });
    return trap;
  };
  var removeListeners = function removeListeners2() {
    if (!state.active) {
      return;
    }
    doc.removeEventListener("focusin", checkFocusIn, true);
    doc.removeEventListener("mousedown", checkPointerDown, true);
    doc.removeEventListener("touchstart", checkPointerDown, true);
    doc.removeEventListener("click", checkClick, true);
    doc.removeEventListener("keydown", checkKey, true);
    return trap;
  };
  trap = {
    get active() {
      return state.active;
    },
    get paused() {
      return state.paused;
    },
    activate: function activate(activateOptions) {
      if (state.active) {
        return this;
      }
      var onActivate = getOption(activateOptions, "onActivate");
      var onPostActivate = getOption(activateOptions, "onPostActivate");
      var checkCanFocusTrap = getOption(activateOptions, "checkCanFocusTrap");
      if (!checkCanFocusTrap) {
        updateTabbableNodes();
      }
      state.active = true;
      state.paused = false;
      state.nodeFocusedBeforeActivation = doc.activeElement;
      if (onActivate) {
        onActivate();
      }
      var finishActivation = function finishActivation2() {
        if (checkCanFocusTrap) {
          updateTabbableNodes();
        }
        addListeners();
        if (onPostActivate) {
          onPostActivate();
        }
      };
      if (checkCanFocusTrap) {
        checkCanFocusTrap(state.containers.concat()).then(finishActivation, finishActivation);
        return this;
      }
      finishActivation();
      return this;
    },
    deactivate: function deactivate(deactivateOptions) {
      if (!state.active) {
        return this;
      }
      var options = _objectSpread2({
        onDeactivate: config.onDeactivate,
        onPostDeactivate: config.onPostDeactivate,
        checkCanReturnFocus: config.checkCanReturnFocus
      }, deactivateOptions);
      clearTimeout(state.delayInitialFocusTimer);
      state.delayInitialFocusTimer = void 0;
      removeListeners();
      state.active = false;
      state.paused = false;
      activeFocusTraps.deactivateTrap(trap);
      var onDeactivate = getOption(options, "onDeactivate");
      var onPostDeactivate = getOption(options, "onPostDeactivate");
      var checkCanReturnFocus = getOption(options, "checkCanReturnFocus");
      var returnFocus = getOption(options, "returnFocus", "returnFocusOnDeactivate");
      if (onDeactivate) {
        onDeactivate();
      }
      var finishDeactivation = function finishDeactivation2() {
        delay(function() {
          if (returnFocus) {
            tryFocus(getReturnFocusNode(state.nodeFocusedBeforeActivation));
          }
          if (onPostDeactivate) {
            onPostDeactivate();
          }
        });
      };
      if (returnFocus && checkCanReturnFocus) {
        checkCanReturnFocus(getReturnFocusNode(state.nodeFocusedBeforeActivation)).then(finishDeactivation, finishDeactivation);
        return this;
      }
      finishDeactivation();
      return this;
    },
    pause: function pause() {
      if (state.paused || !state.active) {
        return this;
      }
      state.paused = true;
      removeListeners();
      return this;
    },
    unpause: function unpause() {
      if (!state.paused || !state.active) {
        return this;
      }
      state.paused = false;
      updateTabbableNodes();
      addListeners();
      return this;
    },
    updateContainerElements: function updateContainerElements(containerElements) {
      var elementsAsArray = [].concat(containerElements).filter(Boolean);
      state.containers = elementsAsArray.map(function(element) {
        return typeof element === "string" ? doc.querySelector(element) : element;
      });
      if (state.active) {
        updateTabbableNodes();
      }
      return this;
    }
  };
  trap.updateContainerElements(elements);
  return trap;
};

// src/scripts/helpers/event.js
function sendEvent(element, name, data = {}) {
  element.dispatchEvent(new CustomEvent(name, {
    detail: data,
    bubbles: true
  }));
}

// src/scripts/components/expandable-html-element.js
var ExpandableHTMLElement = class extends HTMLElement {
  constructor() {
    super();
    this.addEventListener("click", (event) => {
      if (!event.target.hasAttribute("close"))
        return;
      event.stopPropagation();
      event.target.closest(this.tagName).open = false;
    });
  }
  static get observedAttributes() {
    return ["open"];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (newValue !== null) {
      setTimeout(() => this.focusTrap.activate(), 150);
    } else {
      this.focusTrap.deactivate();
    }
    this.sendEvent();
  }
  get overlay() {
    return this.hasAttribute("overlay");
  }
  get open() {
    return this.hasAttribute("open");
  }
  set open(value) {
    if (Boolean(value)) {
      this.setAttribute("open", "");
    } else {
      this.removeAttribute("open");
    }
  }
  get focusTrap() {
    return this._focusTrap = this._focusTrap || createFocusTrap(this, this.focusTrapOptions);
  }
  get focusTrapOptions() {
    return {
      allowOutsideClick: (event) => event.target.getAttribute("aria-controls") === this.id,
      clickOutsideDeactivates: (event) => !(event.target.getAttribute("aria-controls") === this.id),
      onDeactivate: () => this.open = false,
      ...this._focusTrapOptions
    };
  }
  set focusTrapOptions(options) {
    this._focusTrapOptions = options;
  }
  sendEvent() {
    sendEvent(
      this,
      this.open ? "expandable-html-element:open" : "expandable-html-element:close"
    );
  }
};

// src/scripts/components/modal.js
import { animate } from "@loess/vendor";
var Modal = class extends ExpandableHTMLElement {
  constructor() {
    super();
    this.mql = window.matchMedia("(max-width: 751px)");
    this.addEventListener("click", (event) => {
      this.onClickOverlay(event.target);
    }, false);
  }
  async attributeChangedCallback(name, oldValue, newValue) {
    await this._animate().finished;
    super.attributeChangedCallback(name, oldValue, newValue);
    switch (name) {
      case "open":
        document.documentElement.classList.toggle("scroll-lock", this.open);
        break;
    }
  }
  onClickOverlay(target) {
    if (target !== this)
      return;
    this.open = false;
  }
  _animate() {
    if (this.open) {
      return animate(
        this.querySelector(".modal__inner"),
        { opacity: [0, 1], visibility: ["hidden", "visible"], transform: this.mql.matches || !this.mql.matches && this.querySelector(".modal__inner").classList.contains("modal__inner--fullscreen") ? ["translateY(100px)", "translateY(0)"] : ["translate(-50%, calc(-50% + 100px))", "translate(-50%, -50%)"] },
        { duration: 0.25, easing: "cubic-bezier(0.5, 0, 0.175, 1)" }
      );
    } else {
      return animate(
        this.querySelector(".modal__inner"),
        { opacity: [1, 0], visibility: ["visible", "hidden"] },
        { duration: 0.15, easing: "cubic-bezier(0.5, 0, 0.175, 1)" }
      );
    }
  }
};
if (!customElements.get("loess-modal")) {
  window.customElements.define("loess-modal", Modal);
}

// src/scripts/components/cart-notification-popup.js
import { animate as animate2 } from "@loess/vendor";
if (!customElements.get("loess-cart-notification-popup")) {
  window.customElements.define("loess-cart-notification-popup", class extends Modal {
    _animate() {
      if (this.open) {
        return animate2(
          this.querySelector(".cart-notification"),
          { opacity: [0, 1], visibility: ["hidden", "visible"], y: [10, 0] },
          { duration: 0.25 }
        );
      } else {
        return animate2(
          this.querySelector(".cart-notification"),
          { opacity: [1, 0], visibility: ["visible", "hidden"] },
          { duration: 0.15 }
        );
      }
    }
  });
}

// src/scripts/components/collapsible-panel.js
if (!customElements.get("loess-collapsible-panel")) {
  window.customElements.define("loess-collapsible-panel", class extends ExpandableHTMLElement {
    constructor() {
      super();
      if (!this.dismissable) {
        this.focusTrapOptions = {
          fallbackFocus: this,
          onDeactivate: () => {
          }
        };
      }
      this.animationOnInit = this.open || false;
    }
    async attributeChangedCallback(name, oldValue, newValue) {
      if (this.animationOnInit) {
        this.animationOnInit = false;
        return;
      }
      await this._animate().finished;
      super.attributeChangedCallback(name, oldValue, newValue);
    }
    _animate() {
      const keyframes = {
        opacity: [0, 1],
        visibility: ["hidden", "visible"],
        height: ["0px", `${this.scrollHeight}px`]
      };
      return this.animate(keyframes, {
        duration: this.open ? 250 : 150,
        direction: this.open ? "normal" : "reverse",
        easing: "cubic-bezier(0.5, 0, 0.175, 1)"
      });
    }
    get dismissable() {
      return this.hasAttribute("dismissable");
    }
  });
}

// src/scripts/components/cursor.js
if (!customElements.get("loess-cursor")) {
  window.customElements.define("loess-cursor", class extends HTMLElement {
    connectedCallback() {
      this.controller = new AbortController();
      this.parentElement.addEventListener("pointermove", this.onPointerMove.bind(this), { passive: true, signal: this.controller.signal });
      this.parentElement.addEventListener("pointerleave", this.onPointerLeave.bind(this), { signal: this.controller.signal });
    }
    disconnectedCallback() {
      this.controller?.abort();
    }
    onPointerMove(event) {
      if (event.target.matches("button, a[href], button :scope, a[href] :scope")) {
        this.classList.remove("active");
        return;
      }
      const parentRect = this.parentElement.getBoundingClientRect();
      const parentXCenterPosition = (parentRect.left + parentRect.right) / 2;
      const isLeftSide = event.pageX < parentXCenterPosition;
      this.classList.toggle("left", isLeftSide);
      this.classList.add("active");
      const mouseY = event.clientY - parentRect.y - this.clientHeight / 2;
      const mouseX = event.clientX - parentRect.x - this.clientWidth / 2;
      this.style.translate = `${mouseX.toFixed(3)}px ${mouseY.toFixed(3)}px`;
      this.style.transform = `${mouseX.toFixed(3)}px ${mouseY.toFixed(3)}px`;
    }
    onPointerLeave() {
      this.classList.remove("active");
    }
  });
}

// src/scripts/components/drawer.js
import { timeline, stagger } from "@loess/vendor";
var Drawer = class extends ExpandableHTMLElement {
  constructor() {
    super();
    this.addEventListener("click", (event) => {
      this.onClickOverlay(event.target);
    }, false);
  }
  async attributeChangedCallback(name, oldValue, newValue) {
    if (!this.open) {
      await this.closeDrawer().finished;
    } else {
      await this.openDrawer().finished;
    }
    super.attributeChangedCallback(name, oldValue, newValue);
    switch (name) {
      case "open":
        if (!this.classList.contains("drawer--inner")) {
          document.documentElement.classList.toggle("scroll-lock", this.open);
        }
        break;
    }
  }
  get position() {
    return this.getAttribute("position") || "left";
  }
  onClickOverlay(target) {
    if (target !== this)
      return;
    this.open = false;
  }
  openDrawer() {
    return timeline([
      [this, { visibility: ["hidden", "visible"], opacity: [0, 1], x: [this.position == "left" ? "-10%" : "10%", 0] }, { duration: 0.15 }],
      [".drawer__content", { opacity: [0, 1], x: [this.position == "left" ? -10 : 10, 0] }, { duration: 0.15 }]
    ]);
  }
  closeDrawer() {
    return timeline([
      [this, { visibility: ["visible", "hidden"], opacity: [1, 0], x: [0, this.position == "left" ? "-10%" : "10%"] }, { duration: 0.15 }]
    ]);
  }
};
if (!customElements.get("loess-drawer")) {
  window.customElements.define("loess-drawer", Drawer);
}

// src/scripts/components/filters.js
var LoessFilters = class extends Drawer {
  constructor() {
    super();
    this.mql = window.matchMedia("(max-width: 990px)");
    if (this.sticky) {
      this.mql.addListener(this.setupTabletDrawer.bind(this));
      this.setupTabletDrawer(this.mql);
    }
    if (this.sticky && !this.mql.matches) {
      this.setupStickyScroll(this);
    }
    this.addEventListener("click", (event) => {
      if (event.target.nodeName !== "INPUT" || event.target.type !== "checkbox")
        return;
      if (!event.target.name.startsWith("filter."))
        return;
      this.onFilterChange(event);
    });
  }
  setupTabletDrawer(event) {
    this.classList.toggle("drawer", event.matches);
  }
  onFilterChange(event) {
    const formData = new FormData(event.target.closest("form"));
    const searchParams = new URLSearchParams(formData).toString();
    sendEvent(this, "filters:changed", { searchParams });
  }
  get sticky() {
    return this.hasAttribute("sticky");
  }
};
Object.assign(LoessFilters.prototype, StickyScrollMixin);
if (!customElements.get("loess-filters")) {
  window.customElements.define("loess-filters", LoessFilters);
}
if (!customElements.get("loess-filters-toggle")) {
  window.customElements.define("loess-filters-toggle", class extends HTMLButtonElement {
    constructor() {
      super();
      this.isHidden = true;
      this.list = this.previousElementSibling;
      this.listElements = this.list.querySelectorAll(".collection-filter__list-item--hidden");
      this.addEventListener("click", this.onClickToggle.bind(this));
    }
    onClickToggle() {
      this.expanded = !this.expanded;
      this.isHidden = !this.isHidden;
      this.listElements.forEach((item) => item.toggleAttribute("hidden"));
    }
    get expanded() {
      return this.getAttribute("aria-expanded") === "true";
    }
    set expanded(value) {
      this.setAttribute("aria-expanded", String(value));
    }
  }, { extends: "button" });
}

// src/scripts/components/filters-clear.js
if (!customElements.get("loess-filters-clear")) {
  window.customElements.define("loess-filters-clear", class extends HTMLAnchorElement {
    constructor() {
      super();
      this.addEventListener("click", this.onFilterCleared.bind(this));
    }
    onFilterCleared(event) {
      event.preventDefault();
      const url = new URL(this.href);
      const searchParams = new URLSearchParams(url.search).toString();
      sendEvent(this, "filters:changed", { searchParams });
    }
  }, { extends: "a" });
}

// src/scripts/components/filters-price.js
if (!customElements.get("loess-filters-price")) {
  window.customElements.define("loess-filters-price", class extends HTMLElement {
    constructor() {
      super();
      this.rangeInput = this.querySelectorAll(".price-range__range");
      this.priceInput = this.querySelectorAll(".price-range__input");
      this.range = this.querySelector(".price-slider__progress");
      this.priceGap = 10;
      this.priceInput.forEach((input) => {
        input.addEventListener("input", this.onInputPrice.bind(this));
        input.addEventListener("change", this.onChangePrice.bind(this));
      });
      this.rangeInput.forEach((input) => {
        input.addEventListener("input", this.onInputRange.bind(this));
        input.addEventListener("change", this.onChangePrice.bind(this));
      });
      this.range.style.left = "0%";
      this.range.style.right = "0%";
    }
    onInputPrice(event) {
      const minPrice = parseInt(this.priceInput[0].value);
      const maxPrice = parseInt(this.priceInput[1].value);
      if (maxPrice - minPrice >= this.priceGap && maxPrice <= this.rangeInput[1].max) {
        if (event.target.hasAttribute("input-min")) {
          this.rangeInput[0].value = minPrice;
          this.range.style.left = minPrice / this.rangeInput[0].max * 100 + "%";
        } else {
          this.rangeInput[1].value = maxPrice;
          this.range.style.right = 100 - maxPrice / this.rangeInput[1].max * 100 + "%";
        }
      }
    }
    onInputRange(event) {
      const minVal = parseInt(this.rangeInput[0].value);
      const maxVal = parseInt(this.rangeInput[1].value);
      if (maxVal - minVal < this.priceGap) {
        if (event.target.hasAttribute("input-min")) {
          this.rangeInput[0].value = maxVal - this.priceGap;
        } else {
          this.rangeInput[1].value = minVal + this.priceGap;
        }
      } else {
        this.priceInput[0].value = minVal;
        this.priceInput[1].value = maxVal;
        this.range.style.left = minVal / this.rangeInput[0].max * 100 + "%";
        this.range.style.right = 100 - maxVal / this.rangeInput[1].max * 100 + "%";
      }
    }
    onChangePrice(event) {
      event.preventDefault();
      const formData = new FormData(event.target.closest("form"));
      const searchParams = new URLSearchParams(formData).toString();
      sendEvent(this, "filters:changed", { searchParams });
    }
  });
}

// src/scripts/components/free-shipping-bar.js
if (!customElements.get("loess-free-shipping-bar")) {
  window.customElements.define("loess-free-shipping-bar", class extends HTMLElement {
    connectedCallback() {
      document.documentElement.addEventListener("cart:updated", this.update.bind(this));
    }
    async update(event) {
      let total_price = event.detail["cart"]["total_price"];
      if (!total_price) {
        const response = await fetch("/cart.js", { method: "GET" });
        const responseText = await response.json();
        total_price = responseText["total_price"];
      }
      this.style.setProperty("--progress", Math.min(parseFloat(total_price) / this.threshold, 1));
    }
    get threshold() {
      return parseFloat(this.getAttribute("threshold"));
    }
  });
}

// src/scripts/components/gift-card-recipient.js
window.customElements.define(
  "gift-card-recipient",
  class extends HTMLElement {
    constructor() {
      super();
      this.recipientCheckbox;
      this.recipientFieldsContainer;
      this.recipientOtherProperties = [];
    }
    connectedCallback() {
      const properties = Array.from(
        this.querySelectorAll('[name*="properties"]')
      );
      const checkboxPropertyName = "properties[__shopify_send_gift_card_to_recipient]";
      this.recipientCheckbox = properties.find(
        (input) => input.name === checkboxPropertyName
      );
      this.recipientOtherProperties = properties.filter(
        (input) => input.name !== checkboxPropertyName
      );
      this.recipientFieldsContainer = this.querySelector(
        ".gift-card-recipient__fields"
      );
      this.recipientCheckbox?.addEventListener(
        "change",
        this.synchronizeProperties.bind(this)
      );
      this.synchronizeProperties();
    }
    synchronizeProperties() {
      this.recipientOtherProperties.forEach(
        (property) => property.disabled = !this.recipientCheckbox.checked
      );
      this.recipientFieldsContainer.classList.toggle(
        "hidden",
        !this.recipientCheckbox.checked
      );
    }
  }
);

// src/scripts/components/heading.js
import { animate as animate3, inView, stagger as stagger2 } from "@loess/vendor";
var LoessHeading = class extends HTMLHeadingElement {
  constructor() {
    super();
    if (window.LoessTheme.animations.heading == "fade-in-letters") {
      var textWrapper = this.querySelector(".letters");
      textWrapper.innerHTML = textWrapper.textContent.replace(/\S/g, "<span class='letter'>$&</span>");
    }
    inView(this, this.stagger.bind(this), { margin: "0px 0px -100px 0px" });
  }
  stagger() {
    this.style.opacity = "1";
    animate3(this.elements, this.keyframes, this.options);
  }
  get elements() {
    if (window.LoessTheme.animations.heading == "fade-in-words") {
      return this.querySelectorAll(".word");
    } else {
      return this.querySelectorAll(".letter");
    }
  }
  get keyframes() {
    if (window.LoessTheme.animations.heading == "fade-in-words") {
      return { opacity: [0, 1], y: [10, 0] };
    } else {
      return { opacity: [0, 1], x: [10, 0] };
    }
  }
  get options() {
    if (window.LoessTheme.animations.heading == "fade-in-words") {
      return { delay: stagger2(0.05) };
    } else {
      return { delay: stagger2(0.01) };
    }
  }
  getSequence(customOptions = {}) {
    return [this.elements, this.keyframes, { ...this.options, ...customOptions }];
  }
};
if (!customElements.get("loess-heading")) {
  window.customElements.define("loess-heading", LoessHeading, { extends: "h2" });
}

// src/scripts/components/hero-navigation.js
import { delegate } from "@loess/vendor";
if (!customElements.get("loess-hero-navigation")) {
  window.customElements.define("loess-hero-navigation", class extends HTMLElement {
    constructor() {
      super();
      this.buttons = Array.from(this.querySelectorAll("button"));
    }
    connectedCallback() {
      this.controller = new AbortController();
      delegate(
        this,
        "button",
        "click",
        this.onButtonClick.bind(this),
        {
          signal: this.controller.signal
        }
      );
    }
    disconnectedCallback() {
      this.controller?.abort();
    }
    onButtonClick(event) {
      if (this.selectedButton === event.target)
        return;
      const index = event.target.dataset.index;
      sendEvent(event.target, "slider:navigation:clicked", { index });
    }
    setActiveState(button, swiped = false) {
      this.scroller = this.scroller || this.querySelector(".scroller");
      this.selectedButton?.removeAttribute("active");
      button.setAttribute("active", "");
      if (window.matchMedia("(max-width: 750px)") && swiped) {
        this.scroller.scrollTo({
          behavior: "smooth",
          left: button.offsetLeft - this.scroller.clientWidth / 2 + button.clientWidth / 1.85
        });
      } else {
        const buttonRect = button.getBoundingClientRect();
        const containerRect = this.scroller.getBoundingClientRect();
        this.scroller.scrollTo({
          behavior: "smooth",
          left: buttonRect.left + this.scroller.scrollLeft - containerRect.left - this.scroller.clientWidth / 2 + buttonRect.width / 2
        });
      }
    }
    get selectedButton() {
      return this.buttons.find((button) => {
        return button.hasAttribute("active");
      });
    }
  });
}
if (!customElements.get("loess-hero-navigation-button")) {
  window.customElements.define("loess-hero-navigation-button", class extends HTMLButtonElement {
    constructor() {
      super();
      this.addEventListener("animationend", this.onAnimationEnd.bind(this));
    }
    onAnimationEnd(event) {
      sendEvent(event.target, "autoplay:progress:end");
    }
  }, { extends: "button" });
}

// src/scripts/helpers/throttle.js
function throttle(callback, wait, immediate = false) {
  let timeout = null;
  let initialCall = true;
  return function() {
    const callNow = immediate && initialCall;
    const next = () => {
      callback.apply(this, arguments);
      timeout = null;
    };
    if (callNow) {
      initialCall = false;
      next();
    }
    if (!timeout) {
      timeout = setTimeout(next, wait);
    }
  };
}

// src/scripts/components/scroller.js
import { inView as inView2 } from "@loess/vendor";
var Scroller = class extends HTMLElement {
  constructor() {
    super();
    if (!this.enabledScrollerMobile && !this.enabledScrollerLarge)
      return;
    this.scroller = this.querySelector("ul");
    this.scroller.style.scrollSnapType = "x mandatory";
    this._checkMediaQueryBreakpoint();
  }
  connectedCallback() {
    this.previousSlide = this._previousSlide.bind(this);
    this.nextSlide = this._nextSlide.bind(this);
    this.addEventListener("scroller:previousButton:clicked", this.previousSlide);
    this.addEventListener("scroller:nextButton:clicked", this.nextSlide);
    this.addEventListener("autoplay:progress:end", this.nextSlide);
    if (this.autoPlay) {
      this.autoPlayProgress = this.querySelector("loess-slider-autoplay-progress");
      this.play();
      inView2(this, () => {
        this.play();
        return () => this.pause();
      });
      let initialX = 0;
      this.addEventListener("pointerdown", (event) => {
        initialX = event.pageX;
      });
      const handleMove = (event) => {
        const thresholdMet = event.pageX <= initialX - 5 || event.pageX >= initialX + 5;
        if (thresholdMet) {
          this.autoPlayProgress.remove();
          this.removeEventListener("pointermove", handleMove);
        }
      };
      this.addEventListener("pointermove", handleMove);
    }
  }
  disconnectedCallback() {
    this.removeEventListener("scroller:previousButton:clicked", this.previousSlide);
    this.removeEventListener("scroller:nextButton:clicked", this.nextSlide);
    this.removeEventListener("autoplay:progress:end", this.nextSlide);
  }
  _checkMediaQueryBreakpoint() {
    this.mediaQueryList = [
      window.matchMedia("(min-width: 991px)"),
      window.matchMedia("(min-width: 751px)")
    ];
    this.mediaQueryList.forEach((mediaQuery) => {
      mediaQuery.addListener(this.mediaQueryHandler.bind(this));
    });
    this.mediaQueryHandler();
  }
  async mediaQueryHandler() {
    this.scroller.scrollLeft = 0;
    if (this.observer)
      this.observer.disconnect();
    if (!this.numberOfColumns)
      return;
    if (this.items.length <= this.numberOfColumns)
      return;
    this._setupItemsIntersectionObserver();
  }
  _setupItemsIntersectionObserver() {
    const options = {
      root: !this.mediaQueryList[0].matches && this.sentinels.length !== 2 ? this.scroller : null,
      rootMargin: this.observerRootMargin
    };
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting)
          return;
      });
    }, options);
    this.sentinels.forEach((item) => {
      this.observer.observe(item);
    });
  }
  get observerRootMargin() {
    if (this.mediaQueryList[0].matches) {
      return "0px";
    }
    if (this.items.length === this.sentinels.length) {
      return "-50%";
    }
    return "-25%";
  }
  get sentinels() {
    return Array.from(this.items).filter((element, index, array) => index % this.numberOfColumns == 0);
  }
  get numberOfColumns() {
    if (this.mediaQueryList[0].matches && this.enabledScrollerLarge) {
      return this.columnsLarge;
    }
    if (this.mediaQueryList[1].matches && this.enabledScrollerTablet) {
      return this.columnsTablet;
    }
    return this.columnsMobile;
  }
  get enabledScrollerMobile() {
    return this.hasAttribute("columns-mobile");
  }
  get enabledScrollerTablet() {
    return this.hasAttribute("columns-tablet");
  }
  get enabledScrollerLarge() {
    return this.hasAttribute("columns-large");
  }
  get columnsMobile() {
    return Number(this.getAttribute("columns-mobile"));
  }
  get columnsTablet() {
    return Number(this.getAttribute("columns-tablet") || this.columnsMobile + 1);
  }
  get columnsLarge() {
    return Number(this.getAttribute("columns-large"));
  }
  get items() {
    return this.scroller.children;
  }
  get autoPlay() {
    return this.hasAttribute("auto-play");
  }
  _previousSlide(event) {
    this.autoPlayProgress?.reset();
    if (!this.noDisableState) {
      event.target.nextElementSibling?.removeAttribute("disabled");
      event.target.toggleAttribute("disabled", this.scroller.scrollLeft - (this.scroller.clientWidth + 10) <= 0);
    }
    this._changeSlide(-1);
  }
  _nextSlide(event) {
    this.autoPlayProgress?.reset();
    if (!this.noDisableState) {
      event.target.previousElementSibling?.removeAttribute("disabled");
      event.target.toggleAttribute("disabled", this.scroller.scrollLeft + (this.scroller.clientWidth + 10) * 2 >= this.scroller.scrollWidth);
    }
    this._changeSlide(1);
  }
  _changeSlide(direction) {
    const columnGap = 2;
    return new Promise((resolve) => {
      if (this.autoPlay) {
        const slides = [...this.items];
        const activeSlide = slides.find((item) => item.hasAttribute("active"));
        const nextSlide = activeSlide.nextElementSibling;
        slides.forEach((slide) => slide.removeAttribute("active"));
        if (nextSlide) {
          this.scroller.scrollBy({
            left: activeSlide.offsetWidth + columnGap,
            behavior: "smooth"
          });
          nextSlide.setAttribute("active", "");
        } else {
          this.scroller.scrollTo({
            left: 0,
            behavior: "smooth"
          });
          slides[0].setAttribute("active", "");
        }
      } else {
        this.scroller.scrollBy({
          left: direction * (this.scroller.clientWidth + columnGap),
          behavior: "smooth"
        });
      }
      resolve();
    }).then(() => {
      this.autoPlayProgress?.play();
    });
  }
  pause() {
    this.style.setProperty("--auto-play-state", "paused");
  }
  play() {
    if (!this.autoPlay)
      return;
    this.style.setProperty("--auto-play-state", "running");
  }
};
if (!customElements.get("loess-scroller")) {
  window.customElements.define("loess-scroller", Scroller);
}
if (!customElements.get("loess-scroller-progress")) {
  window.customElements.define("loess-scroller-progress", class extends HTMLElement {
    connectedCallback() {
      this.updateProgress = throttle(this._updateProgress.bind(this));
      this.scrollableElement.addEventListener("scroll", this.updateProgress);
      this.resizeObserver = new ResizeObserver(this.updateProgress).observe(this.scrollableElement);
    }
    disconnectedCallback() {
      this.scrollableElement.removeEventListener("scroll", this.updateProgress);
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
    }
    _updateProgress() {
      const progress = (this.scrollableElement.scrollLeft + this.scrollableElement.clientWidth) / this.scrollableElement.scrollWidth;
      this.style.setProperty("--scroller-progress", Math.max(0, Math.min(progress, 1)));
    }
    get scrollableElement() {
      return this._scrollableElement = this._scrollableElement || document.getElementById(this.getAttribute("target"));
    }
  });
}
if (!customElements.get("loess-scroller-buttons")) {
  window.customElements.define("loess-scroller-buttons", class extends HTMLElement {
    constructor() {
      super();
      this.previousButton = this.querySelector("button:first-of-type");
      this.nextButton = this.querySelector("button:last-of-type");
    }
    connectedCallback() {
      this.previousButton.addEventListener("click", () => {
        sendEvent(this.previousButton, "scroller:previousButton:clicked");
      });
      this.nextButton.addEventListener("click", () => {
        sendEvent(this.nextButton, "scroller:nextButton:clicked");
      });
    }
  });
}

// src/scripts/components/hero-scroller.js
if (!customElements.get("loess-hero-scroller")) {
  window.customElements.define("loess-hero-scroller", class extends Scroller {
    constructor() {
      super();
      this.noDisableState = true;
    }
    connectedCallback() {
      super.connectedCallback();
      this.mql = window.matchMedia("(max-width: 750px)");
      this.mql.addListener(this.checkForMobileScroller.bind(this));
      this.checkForMobileScroller(this.mql);
    }
    checkForMobileScroller(event) {
      if (event.matches) {
        const options = {
          root: this.scroller,
          threshold: 0.75
        };
        this.observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting)
              return;
            const index = entry.target.querySelector("button").dataset.index;
            sendEvent(entry.target, "slider:navigation:clicked", { index });
          });
        }, options);
        [...this.items].forEach((item) => {
          this.observer.observe(item);
        });
      } else {
        this.observer?.disconnect();
      }
    }
  });
}

// src/scripts/helpers/image-loaded.js
async function imageLoaded(image) {
  if (!image)
    return;
  return image.complete || !image.offsetParent ? Promise.resolve() : new Promise((resolve) => image.onload = resolve());
}

// src/scripts/components/image.js
import { animate as animate4, scroll } from "@loess/vendor";
var LoessImage = class extends HTMLImageElement {
  async connectedCallback() {
    await imageLoaded(this);
    if (this.parallax) {
      const parallaxFloat = 0.3;
      const [scale, translate] = [1 + parallaxFloat, parallaxFloat * 100 / (2 + parallaxFloat)];
      scroll(
        animate4(this, {
          scale: [scale, scale + 0.2],
          y: [`-${translate}%`, `${translate}%`]
        }),
        {
          target: this.parentElement,
          offset: ["start end", "end start"]
        }
      );
    }
    requestAnimationFrame(() => {
      this.removeAttribute("reveal");
    });
  }
  get reveal() {
    return this.hasAttribute("reveal");
  }
  get parallax() {
    return this.parentElement.getAttribute("parallax") === "true";
  }
};
if (!customElements.get("loess-image")) {
  window.customElements.define("loess-image", LoessImage, { extends: "img" });
}

// src/scripts/components/input-field.js
if (!customElements.get("loess-input-field")) {
  window.customElements.define("loess-input-field", class extends HTMLInputElement {
    constructor() {
      super();
      this.addEventListener("keyup", this.handleKeyUp);
    }
    handleKeyUp() {
      this.classList.toggle("input__field--has-input", this.value !== "");
    }
  }, { extends: "input" });
}

// src/scripts/components/localization-form.js
if (!customElements.get("loess-localization-form")) {
  window.customElements.define("loess-localization-form", class extends HTMLElement {
    constructor() {
      super();
      this.inputs = this.querySelector('input[name="locale_code"], input[name="country_code"]');
      this.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", this._onClick.bind(this));
      });
    }
    _onClick(event) {
      event.preventDefault();
      const form = this.querySelector("form");
      this.inputs.value = event.currentTarget.dataset.value;
      if (form)
        form.submit();
    }
  });
}

// src/scripts/components/main-menu.js
if (!customElements.get("loess-main-menu")) {
  window.customElements.define("loess-main-menu", class extends HTMLElement {
    constructor() {
      super();
      this.showTimeout = null;
      const items = Array.from(this.querySelectorAll(".has-dropdown[aria-expanded]"));
      items.forEach((item) => {
        item.parentElement.addEventListener("mouseenter", (event) => {
          this.showDropdown(event.target);
        });
        if (!window.matchMedia("(hover: hover)").matches) {
          item.addEventListener("click", (event) => {
            if (event.target.getAttribute(false))
              return;
            event.preventDefault();
            this.showDropdown(event.target.parentElement);
          });
        }
      });
    }
    showDropdown(navItem) {
      const anchor = navItem.querySelector(".has-dropdown");
      const dropdown = anchor.nextElementSibling;
      this.showTimeout = setTimeout(() => {
        if (anchor.getAttribute("aria-expanded") === "true")
          return;
        anchor.setAttribute("aria-expanded", "true");
        dropdown.removeAttribute("hidden");
        const mouseLeaveHandler = () => {
          this.closeDropdown(navItem);
          navItem.removeEventListener("mouseleave", mouseLeaveHandler);
        };
        navItem.addEventListener("mouseleave", mouseLeaveHandler);
        this.showTimeout = null;
      }, 0);
      navItem.addEventListener("mouseleave", () => {
        if (!this.showTimeout)
          return;
        clearTimeout(this.showTimeout);
      }, { once: true });
    }
    closeDropdown(navItem) {
      const anchor = navItem.querySelector(".has-dropdown");
      const dropdown = anchor.nextElementSibling;
      requestAnimationFrame(() => {
        anchor.setAttribute("aria-expanded", "false");
        setTimeout(() => {
          dropdown.setAttribute("hidden", "");
          clearTimeout(this.showTimeout);
        }, 0);
      });
    }
  }, { extends: "nav" });
}

// src/scripts/components/modal-product.js
import { animate as animate5 } from "@loess/vendor";
if (!customElements.get("loess-modal-product")) {
  window.customElements.define("loess-modal-product", class extends Modal {
    constructor() {
      super();
      if (!this.href)
        return;
      this.focusTrapOptions = {
        fallbackFocus: this,
        onDeactivate: () => {
        }
      };
      this.innerElement = this.querySelector(".modal__inner");
      this.contentElement = this.querySelector(".modal__inner-dynamic-content");
      this.closeButton = this.querySelector(".modal__close-button");
      this.spinner = this.querySelector(".modal__spinner");
    }
    connectedCallback() {
      this.handleState = this._handleState.bind(this);
      this.handleVariantChange = this._handleVariantChange.bind(this);
      document.addEventListener("expandable-html-element:open", this.handleState);
      document.addEventListener("expandable-html-element:close", this.handleState);
      document.addEventListener("product-card:variant:changed", this.handleVariantChange);
    }
    disconnectedCallback() {
      document.removeEventListener("expandable-html-element:open", this.handleState);
      document.removeEventListener("expandable-html-element:close", this.handleState);
      document.removeEventListener("product-card:variant:changed", this.handleVariantChange);
    }
    _handleState(event) {
      event.stopPropagation();
      if (event.target != this)
        return;
      if (event.type == "expandable-html-element:open") {
        this.fetchPage();
      } else {
        if (this.controller)
          this.controller.abort();
        this.resetModal();
      }
    }
    _handleVariantChange(event) {
      if (!event.detail.variantId)
        return;
      if (event.target != this.closest("loess-product-card"))
        return;
      const link = document.createElement("a");
      link.setAttribute("href", this.href);
      const url = new URL(link.href);
      url.searchParams.set("variant", event.detail.variantId);
      this.setAttribute("href", url.toString());
    }
    async fetchPage() {
      this.controller = new AbortController();
      const response = await fetch(this.href, { signal: this.controller.signal });
      const responseText = await response.text();
      const html = new DOMParser().parseFromString(responseText, "text/html");
      await this.renderModalContent(html);
      this.innerElement.classList.add("modal__inner--fit-height");
      if (window.Shopify && Shopify.PaymentButton) {
        Shopify.PaymentButton.init();
      }
    }
    renderModalContent(html) {
      return new Promise((resolve) => {
        this.contentElement.innerHTML = html.getElementById("MainContent").innerHTML;
        this.spinner.classList.add("hidden");
        this.closeButton.style.display = "flex";
        resolve();
      });
    }
    resetModal() {
      this.contentElement.innerHTML = "";
      this.innerElement.classList.remove("modal__inner--fit-height");
      this.spinner.classList.remove("hidden");
      this.closeButton.style.display = "none";
    }
    _animate() {
      if (this.open) {
        return animate5(
          this.querySelector(".modal__inner"),
          { opacity: [0, 1], visibility: ["hidden", "visible"], transform: ["translateY(calc(-50% + 20px))", "translateY(-50%)"] },
          { duration: 0.25, easing: "cubic-bezier(0.5, 0, 0.175, 1)" }
        );
      } else {
        return animate5(
          this.querySelector(".modal__inner"),
          { opacity: [1, 0], visibility: ["visible", "hidden"] },
          { duration: 0.15, easing: "cubic-bezier(0.5, 0, 0.175, 1)" }
        );
      }
    }
    get href() {
      return `${this.getAttribute("href")}`;
    }
  });
}

// src/scripts/components/modal-video.js
if (!customElements.get("loess-modal-video")) {
  window.customElements.define("loess-modal-video", class extends Modal {
    constructor() {
      super();
      this.loaded = false;
      this.closeButton = this.querySelector(".modal__close-button");
    }
    connectedCallback() {
      this.handleState = this._handleState.bind(this);
      document.addEventListener("expandable-html-element:open", this.handleState);
      document.addEventListener("expandable-html-element:close", this.handleState);
    }
    disconnectedCallback() {
      document.removeEventListener("expandable-html-element:open", this.handleState);
      document.removeEventListener("expandable-html-element:close", this.handleState);
    }
    _handleState(event) {
      event.stopPropagation();
      if (event.target != this)
        return;
      if (event.type == "expandable-html-element:open") {
        this.play();
      } else {
        this.pause();
      }
    }
    load() {
      return new Promise((resolve) => {
        const iframe = this.querySelector("iframe");
        iframe.src = iframe.dataset.src;
        iframe.addEventListener("load", () => {
          this.querySelector(".spinner")?.remove();
          this.closeButton.style.display = "flex";
          this.loaded = true;
          resolve();
        });
      });
    }
    async play() {
      if (!this.loaded)
        await this.load();
      if (this.type === "youtube") {
        this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: "" }), "*");
      } else if (this.type === "vimeo") {
        this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ method: "play" }), "*");
      }
    }
    pause() {
      if (!this.loaded)
        return;
      if (this.type === "youtube") {
        this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: "" }), "*");
      } else if (this.type === "vimeo") {
        this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ method: "pause" }), "*");
      }
    }
    get type() {
      return this.getAttribute("type");
    }
  });
}

// src/scripts/components/overlay.js
if (!customElements.get("loess-overlay")) {
  window.customElements.define("loess-overlay", class extends HTMLElement {
    static get observedAttributes() {
      return ["open"];
    }
    async attributeChangedCallback(name) {
      switch (name) {
        case "open":
          document.documentElement.classList.toggle("scroll-lock", this.open);
          break;
      }
    }
    connectedCallback() {
      this.handleState = this._handleState.bind(this);
      document.addEventListener("expandable-html-element:open", this.handleState);
      document.addEventListener("expandable-html-element:close", this.handleState);
    }
    disconnectedCallback() {
      document.removeEventListener("expandable-html-element:open", this.handleState);
      document.removeEventListener("expandable-html-element:close", this.handleState);
    }
    _handleState(event) {
      event.stopPropagation();
      if (!event.target.overlay)
        return;
      if (event.type == "expandable-html-element:open") {
        this.open = true;
      } else {
        this.open = false;
      }
    }
    get open() {
      return this.hasAttribute("open");
    }
    set open(value) {
      if (Boolean(value)) {
        this.setAttribute("open", "");
      } else {
        this.removeAttribute("open");
      }
    }
  });
}

// src/scripts/components/pagination.js
if (!customElements.get("loess-pagination")) {
  window.customElements.define("loess-pagination", class extends HTMLElement {
    constructor() {
      super();
      if (!this.asyncLoad)
        return;
      this.addEventListener("click", this.onPageClick.bind(this));
    }
    onPageClick(event) {
      event.preventDefault();
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set("page", event.target.dataset.page);
      sendEvent(this, "pagination:link:clicked", { searchParams: searchParams.toString() });
    }
    get asyncLoad() {
      return this.hasAttribute("async");
    }
  }, { extends: "nav" });
}

// src/scripts/components/popover.js
if (!customElements.get("loess-popover")) {
  window.customElements.define("loess-popover", class extends ExpandableHTMLElement {
  });
}

// src/scripts/components/product-card.js
if (!customElements.get("loess-product-card")) {
  window.customElements.define("loess-product-card", class extends HTMLElement {
    constructor() {
      super();
      this.colorSwatches = this.querySelectorAll(".card-swatches__button");
      if (!this.colorSwatches.length)
        return;
      this.colorSwatches.forEach((colorSwatch) => {
        colorSwatch.addEventListener("mouseenter", this.onColorSwatchHover.bind(this));
        colorSwatch.addEventListener("click", this.onColorSwatchClick.bind(this));
      });
    }
    onColorSwatchHover(event) {
      this.preloadImage(event.target);
    }
    async onColorSwatchClick(event) {
      const image = this.preloadImage(event.target);
      await imageLoaded(image);
      if (!image.hasAttribute("hidden"))
        return;
      image.removeAttribute("hidden");
      this.updateActiveState(event.target);
      this.variantImages.filter((primaryImage) => {
        return primaryImage !== image;
      }).forEach((image2) => image2.setAttribute("hidden", "true"));
      this.updateProductLinks(event.target);
      sendEvent(this, "product-card:variant:changed", {
        variantId: event.target.dataset.variantId
      });
    }
    preloadImage(colorSwatch) {
      const image = this.getImageWithId(colorSwatch);
      image.setAttribute("loading", "eager");
      return image;
    }
    getImageWithId(colorSwatch) {
      this.variantImages = this.variantImage || Array.from(this.querySelectorAll(".card__primary-image"));
      return this.variantImages.find((image) => {
        return image.dataset.mediaId === colorSwatch.dataset.mediaId;
      });
    }
    updateActiveState(colorSwatch) {
      const activeClass = "card-swatches__button--active";
      this.colorSwatches.forEach((colorSwatch2) => {
        colorSwatch2.classList.remove(activeClass);
      });
      colorSwatch.classList.add(activeClass);
    }
    updateProductLinks(colorSwatch) {
      this.productLinks = this.productLinks || this.querySelectorAll(':not(loess-modal-product)[href*="/products"]');
      this.productLinks.forEach((link) => {
        const url = new URL(link.href);
        url.searchParams.set("variant", colorSwatch.dataset.variantId);
        link.setAttribute("href", url.toString());
      });
    }
  });
}

// src/scripts/components/product-form.js
if (!customElements.get("loess-product-form")) {
  customElements.define("loess-product-form", class extends HTMLElement {
    constructor() {
      super();
      this.form = this.querySelector("form");
      this.form.querySelector("[name=id]").disabled = false;
      this.form.addEventListener("submit", this.onSubmitHandler.bind(this));
      this.cart = document.querySelector("loess-cart-notification") || document.querySelector("loess-cart-drawer-items");
    }
    async onSubmitHandler(event) {
      event.preventDefault();
      this.submitButton = this.submitButton || this.querySelector('[type="submit"]');
      if (this.submitButton.getAttribute("aria-disabled") === "true")
        return;
      this.handleErrorMessage();
      this.submitButton.setAttribute("aria-disabled", true);
      this.submitButton.querySelector("span").classList.add("hidden");
      this.querySelector(".spinner").classList.remove("hide");
      const config = fetchConfig("javascript");
      config.headers["X-Requested-With"] = "XMLHttpRequest";
      delete config.headers["Content-Type"];
      const formData = new FormData(this.form);
      if (this.cart && this.redirectType != "page") {
        formData.append("sections", this.cart.getSectionsToRender().map((section) => section.section));
        formData.append("sections_url", window.location.pathname);
      }
      config.body = formData;
      fetch(`${window.LoessTheme.routes.cart_add_url}`, config).then((response) => response.json()).then(async (state) => {
        if (state.status) {
          this.handleErrorMessage(state.description);
          this.error = true;
          return;
        }
        this.error = false;
        if (!this.cart) {
          window.location = window.LoessTheme.routes.cart_url;
          return;
        }
        if (this.redirectType != "page") {
          const modalProduct = this.closest("loess-modal-product");
          if (modalProduct) {
            modalProduct.open = false;
            await new Promise((r) => setTimeout(r, 100));
          }
        }
        if (this.redirectType == "drawer") {
          this.cart.renderCartItems(state);
          setTimeout(() => {
            document.querySelector(`[aria-controls="${this.cart.closest("loess-drawer").id}"`).click();
          }, 100);
        } else if (this.redirectType == "popup") {
          this.cart.renderCartItems(state);
          const cartPopup = this.cart.closest("loess-cart-notification-popup");
          cartPopup.open = true;
          cartPopup.focus();
        } else {
          window.location = window.LoessTheme.routes.cart_url;
          return;
        }
      }).catch((e) => {
        console.error(e);
      }).finally(() => {
        this.submitButton.removeAttribute("aria-disabled");
        if (this.redirectType != "page") {
          this.submitButton.querySelector("span").classList.remove("hidden");
          this.querySelector(".spinner").classList.add("hide");
        }
      });
    }
    handleErrorMessage(errorMessage = false) {
      this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.form-message[role="alert"]');
      if (!this.errorMessageWrapper)
        return;
      this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector(".form-message__text");
      this.errorMessageWrapper.classList.toggle("hidden", !errorMessage);
      if (errorMessage) {
        this.errorMessage.textContent = errorMessage;
      }
    }
    get redirectType() {
      return this.getAttribute("redirect-type");
    }
  });
}

// src/scripts/components/product-filters.js
if (!customElements.get("loess-product-filters")) {
  window.customElements.define("loess-product-filters", class extends HTMLElement {
    constructor() {
      super();
      this.searchParamsInitial = window.location.search.slice(1);
      this.searchParamsPrev = window.location.search.slice(1);
      this.addEventListener("pagination:link:clicked", this.renderPage.bind(this));
      this.addEventListener("filters:changed", this.renderPage.bind(this));
    }
    connectedCallback() {
      const onHistoryChange = (event) => {
        const searchParams = event.state ? event.state.searchParams : this.searchParamsInitial;
        if (searchParams === this.searchParamsPrev)
          return;
        this.renderPage(searchParams, false);
      };
      window.addEventListener("popstate", onHistoryChange);
    }
    async renderPage(event, updateURLHash = true) {
      let searchParams = event?.detail?.searchParams;
      if (!updateURLHash)
        searchParams = event;
      this.searchParamsPrev = searchParams;
      const url = `${window.location.pathname}?section_id=${this.sectionId}&${this.terms ? `q=${this.terms}` : ""}&${searchParams}`;
      this.setAttribute("loading", "");
      const response = await fetch(url);
      const responseText = await response.text();
      const html = new DOMParser().parseFromString(responseText, "text/html");
      if (!html.querySelector(".product-grid-empty")) {
        this.renderProductGrid(html);
        this.renderFilterValues(html, event);
        this.renderActiveFilters(html);
        this.renderProductCount(html);
        if (updateURLHash)
          this.updateURLHash(searchParams);
      } else {
        if (document.querySelector(".collection-utility-bar__count-text"))
          document.querySelector(".collection-utility-bar__count-text").style.display = "none";
        if (document.querySelector(".collection-utility-bar__sorting"))
          document.querySelector(".collection-utility-bar__sorting").style.display = "none";
        document.getElementById("FilterProductGrid").innerHTML = "";
        document.getElementById("FilterProductGrid").insertAdjacentElement("afterbegin", html.querySelector(".product-grid-empty"));
      }
      this.removeAttribute("loading");
      requestAnimationFrame(() => {
        this.querySelector(".collection").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    }
    renderProductGrid(html) {
      document.querySelector(".collection-bar").parentElement.innerHTML = html.querySelector(".collection-bar")?.parentElement?.innerHTML;
      document.getElementById("FilterProductGrid").innerHTML = html.getElementById("FilterProductGrid").innerHTML;
    }
    renderFilterValues(html) {
      const filterDrawersParent = html.getElementById("FilterDrawers");
      const filterMobileTemp = filterDrawersParent.querySelector("#FilterDrawerMobile");
      if (filterMobileTemp) {
        const filterMobileButtons = Array.from(this.querySelectorAll(".scroller-tabs button"));
        const filterMobileOffsetLeft = this.querySelector('.scroller-tabs button[aria-expanded="true"]').offsetLeft;
        const filterMobileScrollTop = this.querySelector(".drawer__content").scrollTop;
        filterMobileButtons.forEach((button) => {
          const toggle = filterMobileTemp.querySelector(`[aria-controls="${button.getAttribute("aria-controls")}"]`);
          const panel = filterMobileTemp.querySelector(`[id="${button.getAttribute("aria-controls")}"]`);
          const isExpanded = button.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
          toggle.parentElement.toggleAttribute("active", isExpanded);
          panel.removeAttribute("hidden");
          panel.removeAttribute("open");
          panel.setAttribute(isExpanded ? "open" : "hidden", "");
        });
        this.querySelector("#FilterDrawerMobile").innerHTML = filterDrawersParent.querySelector("#FilterDrawerMobile").innerHTML;
        const scrollerTabs = this.querySelector("loess-scroller-tabs");
        scrollerTabs.scrollTo({
          behavior: "instant",
          left: filterMobileOffsetLeft - scrollerTabs.clientWidth / 2 + scrollerTabs.selectedButton.clientWidth / 2
        });
        this.querySelector(".drawer__content").scrollTop = filterMobileScrollTop;
      }
      const filterLargeTemp = filterDrawersParent.querySelector("#FilterDrawerLarge");
      if (filterLargeTemp) {
        const filterLargeButtons = Array.from(this.querySelectorAll('.collection-filter > button[is="loess-button"]'));
        filterLargeButtons.forEach((button) => {
          const toggle = filterLargeTemp.querySelector(`[aria-controls="${button.getAttribute("aria-controls")}"]`);
          const isExpanded = button.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
          toggle.nextElementSibling.toggleAttribute("open", isExpanded);
          const listToggleButton = button.nextElementSibling.querySelector(".collection-filter__more-button");
          if (listToggleButton?.getAttribute("aria-expanded") == "true") {
            const toggleButtonIndex = listToggleButton.getAttribute("index");
            const toggleButton = filterLargeTemp.querySelector(`.collection-filter__more-button[index="${toggleButtonIndex}"]`);
            const hiddenItems = Array.from(toggleButton.previousElementSibling.querySelectorAll(".collection-filter__list-item--hidden"));
            hiddenItems.map((element) => {
              element.removeAttribute("hidden");
              toggleButton.setAttribute("aria-expanded", "true");
            });
          }
        });
        this.querySelector("#FilterDrawerLarge").innerHTML = filterLargeTemp.innerHTML;
      }
    }
    renderActiveFilters(html) {
      const activeFiltersHTML = html.querySelector(".collection-active-filters")?.innerHTML;
      this.querySelectorAll(".collection-active-filters").forEach((element) => {
        element.innerHTML = activeFiltersHTML || "";
      });
    }
    renderProductCount(html) {
      document.getElementById("FilterProductCount").innerHTML = html.getElementById("FilterProductCount").innerHTML;
    }
    updateURLHash(searchParams) {
      history.pushState({ searchParams }, "", `${window.location.pathname}${searchParams && "?".concat(searchParams)}`);
    }
    get sectionId() {
      return this.getAttribute("section-id");
    }
    get terms() {
      return this.getAttribute("terms");
    }
  });
}

// src/scripts/components/product-image-zoom.js
if (!customElements.get("loess-product-image-zoom")) {
  window.customElements.define("loess-product-image-zoom", class extends ExpandableHTMLElement {
    async connectedCallback() {
      this.gallery = this.parentElement.querySelector("loess-product-gallery");
      this.focusTrapOptions = {
        fallbackFocus: this
      };
    }
    disconnectedCallback() {
      this.pswpModule?.destroy();
    }
    async attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      switch (name) {
        case "open":
          if (this.open) {
            this.pswpModule = await this.loadPhotoSwipe();
            this.initializePhotoSwipe();
          }
      }
    }
    async loadPhotoSwipe() {
      return await import("https://cdn.jsdelivr.net/npm/photoswipe@5.3.2/dist/photoswipe.esm.min.js");
    }
    initializePhotoSwipe() {
      const options = {
        dataSource: this.buildImages(),
        index: this.gallery.getActiveSlideIndex(),
        zoom: false,
        counter: false,
        bgOpacity: 1,
        closeOnVerticalDrag: false,
        closeSVG: '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path fill-rule="evenodd" clip-rule="evenodd" d="M.76 8.67a.75.75 0 0 0 1.06 1.06l3.3-3.3L8.3 9.6a.75.75 0 1 0 1.06-1.06L6.18 5.37 9.24 2.3a.75.75 0 0 0-1.06-1.06L5.12 4.31 1.94 1.13A.75.75 0 0 0 .87 2.19l3.19 3.18-3.3 3.3Z"/></svg>',
        arrowNextSVG: '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.066 8.662a.75.75 0 0 0 1.06 0l4.066-4.066L5.127.53a.75.75 0 1 0-1.061 1.061L7.07 4.596 4.066 7.601a.75.75 0 0 0 0 1.061Z"/></svg>',
        arrowPrevSVG: '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" style="transform: rotateY(180deg)"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.066 8.662a.75.75 0 0 0 1.06 0l4.066-4.066L5.127.53a.75.75 0 1 0-1.061 1.061L7.07 4.596 4.066 7.601a.75.75 0 0 0 0 1.061Z"/></svg>'
      };
      const pswp = new this.pswpModule.default(options);
      pswp.init();
      pswp.on("close", () => {
        this.open = false;
      });
    }
    buildImages() {
      return Array.from(this.gallery.querySelectorAll("img")).map((image) => {
        return {
          srcset: image.srcset,
          src: image.src,
          width: image.getAttribute("width"),
          height: image.getAttribute("height"),
          alt: image.alt
        };
      });
    }
  });
}

// src/scripts/components/predictive-search.js
if (!customElements.get("loess-predictive-search")) {
  window.customElements.define("loess-predictive-search", class extends HTMLElement {
    constructor() {
      super();
      this.input = this.querySelector('input[type="search"]');
      this.results = this.querySelector(".predictive-search-results__list");
      this.input.addEventListener("input", debounce(() => {
        this.onChange();
      }).bind(this));
    }
    getQuery() {
      return this.input.value.trim();
    }
    onChange() {
      const searchTerm = this.getQuery();
      this.results.innerHTML = "";
      this.querySelector("loess-predictive-search-results").hidden = false;
      this.querySelector("loess-predictive-search-results").setAttribute("loading", "");
      if (!searchTerm.length) {
        this.querySelector("loess-predictive-search-results").hidden = true;
        return;
      }
      this.searchTerm = searchTerm;
      this.getSearchResults();
    }
    async getSearchResults() {
      const response = await fetch(this.buildQueryString());
      if (!response.ok) {
        const error = new Error(response.status);
        throw error;
      }
      const text = await response.text();
      this.injectHTMLResponse(text);
      this.querySelector("loess-predictive-search-results").removeAttribute("loading");
    }
    buildQueryString() {
      return `${this.fetchUrl}?q=${encodeURIComponent(this.searchTerm)}&${encodeURIComponent("resources[type]")}=${this.resources}&${encodeURIComponent("resources[limit]")}=8&${encodeURIComponent("resources[limit_scope]")}=each&${encodeURIComponent("resources[options][fields]")}=title,product_type,variants.title,vendor,body&section_id=predictive-search`;
    }
    injectHTMLResponse(text) {
      const responseMarkup = new DOMParser().parseFromString(text, "text/html").querySelector("#shopify-section-predictive-search").innerHTML;
      this.results.innerHTML = responseMarkup;
    }
    get fetchUrl() {
      return this.getAttribute("fetch-url");
    }
    get resources() {
      return this.getAttribute("resources");
    }
  });
}

// src/scripts/components/qr-code.js
if (!customElements.get("loess-qr-code")) {
  window.customElements.define("loess-qr-code", class extends HTMLElement {
    constructor() {
      super();
      this._generateQRCode();
    }
    identifier() {
      return this.getAttribute("identifier");
    }
    async _generateQRCode() {
      await fetchInject([window.LoessTheme.scripts.QRCode]);
      new QRCode(this, {
        text: this.identifier,
        width: 120,
        height: 120
      });
    }
  });
}

// src/scripts/components/quantity-input.js
if (!customElements.get("loess-quantity-input")) {
  window.customElements.define("loess-quantity-input", class extends HTMLElement {
    constructor() {
      super();
      this.input = this.querySelector("input");
      this.changeEvent = new Event("change", { bubbles: true });
      this.querySelectorAll("button").forEach(
        (button) => button.addEventListener("click", this.onButtonClick.bind(this))
      );
    }
    onButtonClick(event) {
      event.preventDefault();
      const previousValue = this.input.value;
      event.target.name === "plus" ? this.input.stepUp() : this.input.stepDown();
      if (previousValue !== this.input.value)
        this.input.dispatchEvent(this.changeEvent);
    }
  });
}

// src/scripts/components/scroller-tabs.js
if (!customElements.get("loess-scroller-tabs")) {
  window.customElements.define("loess-scroller-tabs", class extends HTMLElement {
    constructor() {
      super();
      this.buttons = Array.from(this.querySelectorAll("button"));
      this.buttons.forEach((button) => {
        button.addEventListener("click", this.onButtonClick.bind(this));
      });
      if (Shopify.designMode) {
        this.addEventListener("shopify:block:select", this.onButtonClick.bind(this));
      }
    }
    get selectedButton() {
      return this.buttons.find((button) => {
        return button.getAttribute("aria-expanded") === "true";
      });
    }
    async onButtonClick(event) {
      if (this.selectedButton === event.target)
        return;
      this.contentToHide = document.getElementById(this.selectedButton.getAttribute("aria-controls"));
      this.contentToShow = document.getElementById(event.target.getAttribute("aria-controls"));
      this.updateButtons(event.target);
      if (Shopify.designMode && event.detail.load) {
        this.contentToHide.hidden = true;
        this.contentToShow.hidden = false;
      } else {
        this.animateContent();
      }
    }
    onButtonHover(event) {
      const contentToShow = document.getElementById(event.target.getAttribute("aria-controls"));
      this.loadContentImages(contentToShow);
    }
    loadContentImages(contentToShow) {
      const images = contentToShow.querySelectorAll("img");
      if (!images)
        return;
      images.forEach((image) => image.setAttribute("loading", "eager"));
    }
    updateButtons(button) {
      this.selectedButton.parentElement.removeAttribute("active");
      button.parentElement.setAttribute("active", "");
      this.selectedButton.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-expanded", "true");
      this.scrollTo({
        behavior: "smooth",
        left: this.selectedButton.offsetLeft - this.clientWidth / 2 + this.selectedButton.clientWidth / 2
      });
    }
    async animateContent() {
      const options = {
        duration: 150,
        easing: "ease-in-out"
      };
      await this.contentToHide.animate({
        opacity: [1, 0]
      }, options).finished;
      this.contentToHide.hidden = true;
      this.contentToShow.hidden = false;
      await this.contentToShow.animate({
        opacity: [0, 1]
      }, options).finished;
    }
  });
}

// src/scripts/components/share-button.js
if (!customElements.get("loess-share-button")) {
  window.customElements.define("loess-share-button", class extends Button {
    constructor() {
      super();
      this.collapsiblePanel = this.parentElement.nextElementSibling;
      this.copyOrShareButton = this.collapsiblePanel.querySelector("button");
      this.urlToShare = this.collapsiblePanel.querySelector("input")?.value || document.location.href;
      this.copyOrShareButton.addEventListener("click", this.copyOrShare.bind(this));
    }
    copyOrShare() {
      if (navigator.share) {
        navigator.share({ url: this.urlToShare, title: document.title });
      } else {
        this.copyToClipboard();
      }
    }
    async copyToClipboard() {
      await navigator.clipboard.writeText(this.urlToShare);
      alert(window.LoessTheme.strings.copiedToClipboard);
    }
  }, { extends: "button" });
}

// src/scripts/components/shipping-country-selector.js
if (!customElements.get("loess-shipping-country-selector")) {
  window.customElements.define("loess-shipping-country-selector", class extends HTMLSelectElement {
    constructor() {
      super();
      this.addEventListener("change", this.updateProvinceSelector.bind(this));
      this.setDefaultSelectOption(this);
      this.updateProvinceSelector();
    }
    setDefaultSelectOption(selector) {
      if (selector.getAttribute("data-default-option") != "") {
        for (let i = 0; i !== selector.options.length; ++i) {
          if (selector.options[i].text === selector.getAttribute("data-default-option")) {
            selector.selectedIndex = i;
            break;
          }
        }
      }
    }
    updateProvinceSelector() {
      const selectedOption = this.options[this.selectedIndex];
      const provinceElement = document.getElementById(this.getAttribute("aria-owns"));
      const provinceElementSelector = provinceElement.querySelector("select");
      const provinces = JSON.parse(selectedOption.getAttribute("data-provinces"));
      provinceElementSelector.innerHTML = "";
      if (provinces.length === 0) {
        provinceElement.classList.add("input-group--hidden");
        return;
      }
      provinces.forEach((data) => {
        provinceElementSelector.options.add(new Option(data[1], data[0]));
      });
      provinceElement.classList.remove("input-group--hidden");
      this.setDefaultSelectOption(provinceElementSelector);
    }
  }, { extends: "select" });
}

// src/scripts/components/slider.js
import { animate as animate6, inView as inView3, timeline as timeline2, TinyGesture } from "@loess/vendor";
if (!customElements.get("loess-slider")) {
  window.customElements.define("loess-slider", class extends HTMLElement {
    constructor() {
      super();
      this.previousSlideIndex = 0;
      this.currentSlideIndex = 0;
      this.isAnimating = false;
      this.slides = this.querySelectorAll(".slider__slide");
      this.navigation = this.querySelector("loess-hero-navigation");
      if (this.querySelector(".slideshow-hero__cursor")) {
        this.addEventListener("click", this.onSlideshowClick);
      }
    }
    async connectedCallback() {
      this.previousSlide = this.previousSlide.bind(this);
      this.nextSlide = this.nextSlide.bind(this);
      this.setSlide = this.setSlide.bind(this);
      this.addEventListener("slider:previousButton:clicked", this.previousSlide);
      this.addEventListener("slider:nextButton:clicked", this.nextSlide);
      this.addEventListener("slider:navigation:clicked", this.setSlide);
      this.addEventListener("autoplay:progress:end", this.nextSlide);
      if (Shopify.designMode) {
        document.addEventListener("shopify:block:select", (event) => {
          this.pause();
          const index = Array.from(event.target.parentNode.children).indexOf(event.target) || 0;
          this.currentSlideIndex = index;
          this.changeSlide();
        });
        document.addEventListener("shopify:block:deselect", () => {
          this.play();
        });
      }
      if (this.autoPlay) {
        this.autoPlayProgress = this.querySelector("loess-slider-autoplay-progress");
        this.play();
        inView3(this, () => {
          this.play();
          return () => this.pause();
        });
      }
      if (this.hasAttribute("gestures-enabled") && this.slides.length > 1 && window.matchMedia("(max-width: 750px)")) {
        this.gesture = new TinyGesture(this.querySelector(".slider"), {
          diagonalSwipes: false,
          mouseSupport: false
        });
        this.gesture.on("swipeleft", () => {
          this.swiped = true;
          this.nextSlide();
        });
        this.gesture.on("swiperight", () => {
          this.swiped = true;
          this.previousSlide();
        });
      }
    }
    disconnectedCallback() {
      this.removeEventListener("slider:previousButton:clicked", this.previousSlide);
      this.removeEventListener("slider:nextButton:clicked", this.nextSlide);
      this.removeEventListener("autoplay:progress:end", this.nextSlide);
      this.gesture?.destroy();
    }
    onSlideshowClick(event) {
      if (!window.matchMedia("screen and (pointer: fine)").matches)
        return;
      if (event.target.matches("button, button :scope, a[href], a[href] :scope"))
        return;
      event.clientX < window.innerWidth / 2 ? this.previousSlide() : this.nextSlide();
    }
    previousSlide() {
      if (this.currentSlideIndex <= 0) {
        this.currentSlideIndex = this.slides.length - 1;
      } else {
        this.currentSlideIndex--;
      }
      this.changeSlide();
    }
    nextSlide() {
      if (this.currentSlideIndex >= this.slides.length - 1) {
        this.currentSlideIndex = 0;
      } else {
        this.currentSlideIndex++;
      }
      this.changeSlide();
    }
    setSlide(event) {
      this.currentSlideIndex = event.detail.index;
      this.changeSlide();
    }
    async changeSlide() {
      if (this.isAnimating)
        return;
      if (this.previousSlideIndex == this.currentSlideIndex)
        return;
      const fromSlide = this.slides[this.previousSlideIndex];
      const toSlide = this.slides[this.currentSlideIndex];
      this.isAnimating = true;
      this.autoPlayProgress?.reset();
      await this.transitionSlides(fromSlide, toSlide).finished;
      this.updateProgress();
      this.updateThumbnails();
      this.previousSlideIndex = this.currentSlideIndex;
      this.swiped = false;
    }
    async transitionSlides(fromSlide, toSlide) {
      if (this.sliderType === "background-image") {
        await this.transitionBackgroundImage(fromSlide, toSlide);
      } else {
        await this.transitionMediaWithText(fromSlide, toSlide);
      }
      this.isAnimating = false;
      this.autoPlayProgress?.play();
    }
    async transitionBackgroundImage(fromSlide, toSlide) {
      if (this.animation === "cross-fade" || this.animation === "fade") {
        fromSlide.classList.remove("active");
        toSlide.classList.add("active");
        if (this.animation === "cross-fade") {
          await timeline2([
            [fromSlide, { opacity: [1, 0], visibility: ["visible", "hidden"], zIndex: 0 }, { duration: 0.3, easing: "ease-in", zIndex: { easing: "step-end" } }],
            [toSlide, { opacity: [0, 1], visibility: ["hidden", "visible"], zIndex: 1 }, { duration: 0.3, at: "<", easing: "ease-out", zIndex: { easing: "step-end" } }]
          ]).finished;
        } else {
          animate6(fromSlide, { opacity: [1, 0], visibility: ["visible", "hidden"], zIndex: 0 }, { easing: "ease-in", zIndex: { easing: "step-end" } });
          await imageLoaded(toSlide.querySelector("img"));
          animate6(toSlide, { opacity: [0, 1], visibility: ["hidden", "visible"], zIndex: 1 }, { duration: 0, zIndex: { easing: "step-end" } });
          await timeline2([
            [toSlide.querySelectorAll("img"), { opacity: [0, 1], ...!toSlide.querySelector('[parallax="true"]') && { scale: [1.05, 1] } }, { duration: 0.25, easing: "ease-out" }],
            "content",
            [toSlide.querySelectorAll(`.large-subtext, .rte, .button${window.LoessTheme.animations.heading == "none" ? ", h2" : ""}`), { opacity: [0, 1] }, { at: "content" }],
            toSlide.querySelector("h2") && window.LoessTheme.animations.heading != "none" ? toSlide.querySelector("h2").getSequence({ at: "content" }) : []
          ]).finished;
        }
      } else {
        await animate6(fromSlide, { zIndex: 0 }, { duration: 0 });
        await imageLoaded(toSlide.querySelector("img"));
        await animate6(toSlide, { opacity: [0, 1], visibility: ["hidden", "visible"], zIndex: 1 }, { duration: 0, zIndex: { easing: "step-end" } }).finished;
        await timeline2([
          this.animation === "swipe" ? [toSlide, { clipPath: ["inset(0 0 0 100%)", "inset(0 0 0 0)"] }, { duration: 0.5 }] : [toSlide, { clipPath: ["circle(0)", "circle(100%)"] }, { duration: 0.5 }],
          !toSlide.querySelector('[parallax="true"]') ? [toSlide.querySelector("img"), { scale: [1.05, 1] }, { delay: 0.1, at: "<" }] : [],
          "content",
          [toSlide.querySelectorAll(`.large-subtext, .rte, .button${window.LoessTheme.animations.heading == "none" ? ", h2" : ""}`), { opacity: [0, 1] }, { at: "content" }],
          toSlide.querySelector("h2") && window.LoessTheme.animations.heading != "none" ? toSlide.querySelector("h2").getSequence({ at: "content" }) : []
        ]).finished;
        await animate6(fromSlide, { opacity: [1, 0], visibility: ["visible", "hidden"] }, { duration: 0 });
        fromSlide.classList.remove("active");
        toSlide.classList.add("active");
      }
    }
    async transitionMediaWithText(fromSlide, toSlide) {
      if (this.animation === "cross-fade" || this.animation === "fade") {
        if (this.animation === "cross-fade") {
          fromSlide.classList.remove("active");
          toSlide.classList.add("active");
          await timeline2([
            [fromSlide, { opacity: [1, 0], visibility: ["visible", "hidden"], zIndex: 0 }, { duration: 0.3, easing: "ease-in", zIndex: { easing: "step-end" } }],
            [toSlide, { opacity: [0, 1], visibility: ["hidden", "visible"], zIndex: 1 }, { duration: 0.3, at: "<", easing: "ease-out", zIndex: { easing: "step-end" } }]
          ]).finished;
        } else {
          await animate6(fromSlide, { zIndex: 0 }, { duration: 0 });
          await imageLoaded(toSlide.querySelector("img"));
          await timeline2([
            [toSlide, { zIndex: 1 }, { duration: 0, zIndex: { easing: "step-end" } }],
            [toSlide, { opacity: [0, 1], visibility: ["hidden", "visible"] }, { duration: 0.5 }],
            [toSlide.querySelector("img"), { ...!toSlide.querySelector('[parallax="true"]') && { scale: [1.05, 1] } }, { delay: 0.1, at: "<" }]
          ]).finished;
          await animate6(fromSlide, { opacity: [1, 0], visibility: ["visible", "hidden"], zIndex: 0 }, { duration: 0, zIndex: { easing: "step-end" } });
          fromSlide.classList.remove("active");
          toSlide.classList.add("active");
        }
      } else {
        await animate6(fromSlide, { zIndex: 0 }, { duration: 0 });
        await imageLoaded(toSlide.querySelector("img"));
        await animate6(toSlide, { opacity: [0, 1], visibility: ["hidden", "visible"], zIndex: 1 }, { duration: 0, zIndex: { easing: "step-end" } }).finished;
        await timeline2([
          this.animation === "swipe" ? [toSlide, { clipPath: ["inset(0 100% 0 100%)", "inset(0 0 0 0)"] }, { duration: 0.5 }] : [toSlide, { clipPath: ["circle(0)", "circle(100%)"] }, { duration: 0.5 }],
          [toSlide.querySelector("img"), { ...!toSlide.querySelector('[parallax="true"]') && { scale: [1.05, 1] } }, { delay: 0.1, at: "<" }]
        ]).finished;
        await animate6(fromSlide, { opacity: [1, 0], visibility: ["visible", "hidden"] }, { duration: 0 });
        fromSlide.classList.remove("active");
        toSlide.classList.add("active");
      }
    }
    updateProgress() {
      const progressBar = this.querySelector("loess-slider-progress");
      if (!progressBar)
        return;
      const percentage = 100 / this.slides.length * (this.currentSlideIndex + 1);
      progressBar.updateProgress(percentage);
    }
    updateThumbnails() {
      if (!this.navigation || !this.isAnimating)
        return;
      this.buttons = this.buttons || this.navigation.querySelectorAll("button");
      this.navigation.setActiveState(this.buttons[this.currentSlideIndex], this.swiped);
    }
    pause() {
      this.style.setProperty("--auto-play-state", "paused");
    }
    play() {
      if (!this.autoPlay)
        return;
      this.style.setProperty("--auto-play-state", "running");
    }
    get autoPlay() {
      return this.hasAttribute("auto-play");
    }
    get sliderType() {
      return this.getAttribute("type");
    }
    get animation() {
      return this.getAttribute("animation");
    }
  });
}
if (!customElements.get("loess-slider-progress")) {
  window.customElements.define("loess-slider-progress", class extends HTMLElement {
    updateProgress(percentage) {
      this.style.setProperty("--scroller-progress", `${percentage}%`);
    }
  });
}
if (!customElements.get("loess-slider-buttons")) {
  window.customElements.define("loess-slider-buttons", class extends HTMLElement {
    constructor() {
      super();
      this.previousButton = this.querySelector("button:first-of-type");
      this.nextButton = this.querySelector("button:last-of-type");
    }
    connectedCallback() {
      this.previousButton.addEventListener("click", () => {
        sendEvent(this.previousButton, "slider:previousButton:clicked");
      });
      this.nextButton.addEventListener("click", () => {
        sendEvent(this.nextButton, "slider:nextButton:clicked");
      });
    }
  });
}
if (!customElements.get("loess-slider-autoplay-progress")) {
  window.customElements.define("loess-slider-autoplay-progress", class extends HTMLElement {
    constructor() {
      super();
      this.circle = this.querySelector("circle:first-child");
      this.circle.addEventListener("animationend", (event) => {
        sendEvent(event.target, "autoplay:progress:end");
      });
    }
    reset() {
      this.circle.classList.remove("slider-progress-bar__circle--animation");
    }
    play() {
      this.circle.classList.add("slider-progress-bar__circle--animation");
    }
  });
}

// src/scripts/components/sort-by.js
if (!customElements.get("loess-sort-by")) {
  window.customElements.define("loess-sort-by", class extends HTMLSelectElement {
    constructor() {
      super();
      this.resizeElement();
      this.addEventListener("change", this.onChange.bind(this));
    }
    onChange(event) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set("sort_by", event.target.value);
      searchParams.delete("page");
      this.resizeElement();
      sendEvent(this, "filters:changed", { searchParams: searchParams.toString() });
    }
    resizeElement() {
      const tempSelect = document.createElement("select");
      const tempOption = document.createElement("option");
      tempSelect.appendChild(tempOption);
      tempOption.innerHTML = this.options[this.selectedIndex].textContent;
      this.insertAdjacentElement("afterend", tempSelect);
      this.style.width = `${tempSelect.clientWidth}px`;
      tempSelect.remove();
    }
  }, { extends: "select" });
}

// src/scripts/components/stagger-items.js
import { animate as animate7, inView as inView4, stagger as stagger3 } from "@loess/vendor";
var LoessStaggerItems = class extends HTMLElement {
  constructor() {
    super();
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      return;
    }
    inView4(this, this.stagger.bind(this), { margin: "0px 0px -100px 0px" });
  }
  stagger() {
    this.style.opacity = "1";
    animate7(
      this.target,
      { opacity: [0, 1] },
      { delay: stagger3(0.075) }
    );
  }
  get target() {
    const target = this.querySelectorAll(this.getAttribute("target"));
    return target.length ? target : this.children;
  }
};
if (!customElements.get("loess-stagger-items")) {
  window.customElements.define("loess-stagger-items", LoessStaggerItems);
}

// src/scripts/components/variant-pickers.js
if (!customElements.get("loess-variant-picker")) {
  customElements.define("loess-variant-picker", class extends HTMLElement {
    constructor() {
      super();
      this.options = [];
      this.addEventListener("change", this.onVariantChange.bind(this));
      this.checkForInstallmentsBanner();
    }
    onVariantChange(event) {
      this.eventTarget = event.target;
      this.getOptions();
      this.updateMasterId();
      this.updateVariantStatuses();
      if (!this.currentVariant) {
        this.toggleAddButton(true, "", true);
        this.setUnavailable();
      } else {
        this.renderProductInfo();
        this.updateUrl();
        this.updateFullDetailsLinkUrl();
        this.updateVariantInput();
        this.checkForInstallmentsBanner();
        this.dispatchEvent();
      }
    }
    getOptions() {
      this.options = Array.from(this.querySelectorAll("loess-variant-selects, loess-variant-radios")).map((input) => input.getOptionValue());
    }
    updateMasterId() {
      this.currentVariant = this.getVariantData().find((variant) => {
        return !variant.options.map((option, index) => {
          return this.options[index] === option;
        }).includes(false);
      });
    }
    updateUrl() {
      if (!this.currentVariant || this.shouldUpdateUrl === "false")
        return;
      window.history.replaceState({}, "", `${this.productUrl}?variant=${this.currentVariant.id}`);
    }
    updateFullDetailsLinkUrl() {
      if (!this.currentVariant)
        return;
      const fullDetailsLink = document.querySelector(`#ProductFullDetailsLinks-${this.sectionId}`);
      if (fullDetailsLink) {
        fullDetailsLink.href = `${this.productUrl}?variant=${this.currentVariant.id}`;
      }
    }
    updateVariantInput() {
      const productForms = document.querySelectorAll(`#product-form-${this.sectionId}, #product-form-installment-${this.sectionId}`);
      productForms.forEach((productForm) => {
        const input = productForm.querySelector('input[name="id"]');
        input.value = this.currentVariant.id;
      });
    }
    updateVariantStatuses() {
      const selectedOptionOneVariants = this.variantData.filter(
        (variant) => this.querySelector(":checked").value === variant.option1
      );
      const inputWrappers = [...this.children];
      inputWrappers.forEach((option, index) => {
        if (index === 0)
          return;
        const optionInputs = [...option.querySelectorAll('input[type="radio"], option')];
        const previousOptionSelected = inputWrappers[index - 1].querySelector(":checked").value;
        const availableOptionInputsValue = selectedOptionOneVariants.filter((variant) => variant.available && variant[`option${index}`] === previousOptionSelected).map((variantOption) => variantOption[`option${index + 1}`]);
        this.setInputAvailability(optionInputs, availableOptionInputsValue);
      });
      const colorWrapper = inputWrappers.find((wrapper) => {
        const inputs = [...wrapper.querySelectorAll('input[type="radio"]')];
        return inputs.some((input) => input.nextElementSibling.classList.contains("card-swatches__button"));
      });
      if (colorWrapper) {
        const checkedElement = colorWrapper.querySelector(":checked");
        const legendElement = colorWrapper.querySelector("legend");
        if (checkedElement && legendElement) {
          const legendText = legendElement.textContent;
          const [firstWord, secondWord] = legendText.split(":");
          if (firstWord && secondWord) {
            const updatedLegendText = `${firstWord.trim()}: ${checkedElement.value}`;
            legendElement.textContent = updatedLegendText;
          }
        }
      }
    }
    setInputAvailability(listOfOptions, listOfAvailableOptions) {
      listOfOptions.forEach((input) => {
        if (listOfAvailableOptions.includes(input.getAttribute("value"))) {
          input.classList.remove("disabled");
        } else {
          input.classList.add("disabled");
        }
      });
    }
    async renderProductInfo() {
      const response = await fetch(`${this.productUrl}?section_id=${this.sectionId}&variant=${this.currentVariant.id}`);
      const responseText = await response.text();
      const html = new DOMParser().parseFromString(responseText, "text/html");
      this.rerenderBlocks(html);
      const price = document.getElementById(`ProductPrice-${this.sectionId}`);
      if (price)
        price.classList.remove("hidden");
      this.toggleAddButton(!this.currentVariant.available, window.LoessTheme.cartStrings.soldOut);
    }
    rerenderBlocks(html) {
      const blocks = [
        "ProductPrice",
        "Share",
        "StockAvailability",
        "PickupAvailability"
      ];
      blocks.forEach((block) => {
        const element = document.getElementById(`${block}-${this.sectionId}`);
        if (!element)
          return;
        element.innerHTML = html.getElementById(`${block}-${this.sectionId}`).innerHTML;
      });
    }
    getVariantData() {
      this.variantData = this.variantData || JSON.parse(document.querySelector(`#ProductVariantData-${this.sectionId}[type="application/json"]`).textContent);
      return this.variantData;
    }
    dispatchEvent() {
      sendEvent(this.eventTarget, "product:variant:changed", {
        sectionId: this.sectionId,
        variant: this.currentVariant
      });
    }
    toggleAddButton(disable = true, text, modifyClass = true) {
      const productForm = document.getElementById(`product-form-${this.sectionId}`);
      if (!productForm)
        return;
      const addButton = productForm.querySelector('[name="add"]');
      const addButtonText = productForm.querySelector('[name="add"] > span');
      if (!addButton)
        return;
      if (disable) {
        addButton.setAttribute("disabled", "disabled");
        if (text)
          addButtonText.textContent = text;
      } else {
        addButton.removeAttribute("disabled");
        addButtonText.textContent = window.LoessTheme.cartStrings.addToCart;
      }
      if (!modifyClass)
        return;
    }
    setUnavailable() {
      const button = document.getElementById(`product-form-${this.sectionId}`);
      const addButton = button.querySelector('[name="add"]');
      const addButtonText = button.querySelector('[name="add"] > span');
      const price = document.getElementById(`ProductPrice-${this.sectionId}`);
      if (!addButton)
        return;
      addButtonText.textContent = window.LoessTheme.cartStrings.unavailable;
      if (price)
        price.classList.add("hidden");
    }
    async checkForInstallmentsBanner() {
      const modalProduct = this.closest("loess-modal-product");
      if (!modalProduct)
        return;
      await new Promise((r) => setTimeout(r, 500));
      const paymentTerms = modalProduct.querySelector("shopify-payment-terms");
      if (!paymentTerms)
        return;
      paymentTerms.shadowRoot.querySelector(".shopify-installments").style.pointerEvents = "none";
      paymentTerms.shadowRoot.querySelector(".shopify-installments__learn-more").style.pointerEvents = "auto";
    }
    get sectionId() {
      return this.getAttribute("section-id");
    }
    get productUrl() {
      return this.getAttribute("product-url");
    }
    get shouldUpdateUrl() {
      return this.getAttribute("should-update-url");
    }
  });
  customElements.define("loess-variant-selects", class extends HTMLElement {
    getOptionValue() {
      return this.querySelector("select").value;
    }
  });
  customElements.define("loess-variant-radios", class extends HTMLElement {
    getOptionValue() {
      return Array.from(this.querySelectorAll("input")).find((radio) => radio.checked).value;
    }
  });
}

// src/scripts/sections/cookie-banner.js
if (!customElements.get("loess-cookie-banner")) {
  window.customElements.define("loess-cookie-banner", class extends HTMLElement {
    constructor() {
      super();
      this.declineButton = this.querySelector("button:first-of-type");
      this.acceptButton = this.querySelector("button:last-of-type");
    }
    connectedCallback() {
      if (Shopify.designMode) {
        document.addEventListener("shopify:section:select", (event) => {
          if (event.detail.sectionId !== this.sectionId)
            return;
          this.open = true;
        });
        document.addEventListener("shopify:section:deselect", (event) => {
          if (event.detail.sectionId !== this.sectionId)
            return;
          this.open = false;
        });
      }
      this.declineButton.addEventListener("click", this._handleDecline.bind(this));
      this.acceptButton.addEventListener("click", this._handleAccept.bind(this));
      window.Shopify.loadFeatures([
        {
          name: "consent-tracking-api",
          version: "0.1",
          onLoad: this._initCookieBanner.bind(this)
        }
      ]);
    }
    get sectionId() {
      return this.getAttribute("section-id");
    }
    set open(value) {
      this.toggleAttribute("hidden", !value);
    }
    _initCookieBanner() {
      if (!window.Shopify.customerPrivacy.shouldShowGDPRBanner())
        return;
      this.open = true;
    }
    _handleAccept() {
      window.Shopify.customerPrivacy.setTrackingConsent(true, () => this.open = false);
    }
    _handleDecline() {
      window.Shopify.customerPrivacy.setTrackingConsent(false, () => this.open = false);
    }
  });
}

// src/scripts/sections/header.js
if (!customElements.get("loess-header")) {
  window.customElements.define("loess-header", class extends HTMLElement {
    connectedCallback() {
      this.resizeObserver = new ResizeObserver(
        this._updateHeightProperty.bind(this)
      ).observe(this);
      if (this.transparent) {
        this.isTransparentLocked = false;
        document.addEventListener("expandable-html-element:open", this._lockTransparentState.bind(this));
        document.addEventListener("expandable-html-element:close", this._lockTransparentState.bind(this));
        this.addEventListener("mouseenter", this._toggleTransparency.bind(this), true);
        this.addEventListener("mouseleave", this._toggleTransparency.bind(this));
        this.addEventListener("focusin", () => {
          this.classList.remove("header--transparent");
        });
      }
      if (this.transparent && this.sticky) {
        this._onScroll = throttle(this._toggleTransparency.bind(this), 100);
        window.addEventListener("scroll", this._onScroll, { passive: true });
        this._toggleTransparency();
      }
    }
    disconnectedCallback() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      if (this.sticky && this.transparent) {
        window.removeEventListener("scroll", this._onScroll);
      }
    }
    get sticky() {
      return this.hasAttribute("sticky");
    }
    get transparent() {
      return this.hasAttribute("transparent");
    }
    _lockTransparentState(event) {
      if (!["SideBarMenu", "CartDrawer", "HeaderSearch"].includes(event.target.id))
        return;
      this.isTransparentLocked = event.type === "expandable-html-element:open";
      this._toggleTransparency();
    }
    _toggleTransparency(event) {
      if (this.contains(document.activeElement))
        return;
      if (this.sticky && window.scrollY > 15 || event && event.type === "mouseenter" || this.isTransparentLocked) {
        this.classList.remove("header--transparent");
      } else {
        this.classList.add("header--transparent");
      }
    }
    _updateHeightProperty(entries) {
      for (const entry of entries) {
        const height = entry.borderBoxSize && entry.borderBoxSize.length > 0 ? entry.borderBoxSize[0].blockSize : entry.target.clientHeight;
        document.documentElement.style.setProperty("--header-height", `${height}px`);
      }
    }
  });
}

// src/scripts/sections/image-split.js
if (!customElements.get("loess-image-split")) {
  window.customElements.define("loess-image-split", class extends HTMLElement {
    constructor() {
      super();
      this.isDragging = false;
      this.lowerBound = 5;
      this.upperBound = 95;
      this.cursor = this.querySelector(".image-split__cursor");
      this.addEventListener("pointerdown", this.onPointerDown);
      this.addEventListener("pointermove", this.onPointerMove);
      this.addEventListener("pointerup", this.onPointerUp);
    }
    onPointerDown(event) {
      if (event.target !== this.cursor)
        return;
      this.isDragging = true;
      const cursorStyles = getComputedStyle(this.cursor);
      this.initialDragPosition = parseInt(cursorStyles.getPropertyValue("--initial-drag-position"));
    }
    onPointerMove(event) {
      if (!this.isDragging)
        return;
      const xPosition = event.pageX - this.offsetLeft;
      const percentage = parseFloat(xPosition / this.clientWidth * 100).toFixed(2);
      if (percentage < this.lowerBound || percentage > this.upperBound)
        return;
      this.style.setProperty("--initial-drag-position", `${percentage}%`);
    }
    onPointerUp() {
      this.isDragging = false;
    }
  });
}

// src/scripts/sections/main-product.js
if (!customElements.get("loess-product")) {
  window.customElements.define("loess-product", class extends HTMLElement {
    async connectedCallback() {
      await window.customElements.whenDefined("loess-product-gallery");
      this.gallery = this.querySelector("loess-product-gallery");
      this.thumbnails = this.parentElement.querySelector(".main-product-media__thumbnails");
      if (!this.thumbnails)
        return;
      this.slideIndex = this.gallery.getActiveSlideIndex();
      this.addEventListener("product:thumbnail:clicked", this.onClickThumbnail);
      this.addEventListener("scroller:previousButton:clicked", this.onClickPreviousButton);
      this.addEventListener("scroller:nextButton:clicked", this.onClickNextButton);
      this.addEventListener("product:variant:changed", this.onVariantChange);
    }
    onClickPreviousButton(event) {
      event.stopPropagation();
      this.slideIndex = this.slideIndex - 1;
      this.gallery.previousSlide(event, this.gallery.children[this.slideIndex]);
    }
    onClickNextButton(event) {
      event.stopPropagation();
      this.slideIndex = this.slideIndex + 1;
      this.gallery.nextSlide(event, this.gallery.children[this.slideIndex]);
    }
    onClickThumbnail(event) {
      event.stopPropagation();
      this.gallery.changeSlide(event.target);
    }
    onVariantChange(event) {
      event.stopPropagation();
      this.resetErrorMessage();
      const currentVariant = event.detail.variant;
      if (!currentVariant)
        return;
      if (!currentVariant.featured_media)
        return;
      const mediaId = `ProductMedia-${event.detail.sectionId}-${currentVariant.featured_media.id}`;
      this.gallery.changeSlide(document.getElementById(mediaId));
      const thumbnail = this.thumbnails.querySelector(`[aria-controls=${mediaId}]`);
      this.thumbnails.updateThumbnailState(thumbnail);
    }
    resetErrorMessage() {
      this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.form-message[role="alert"]');
      this.errorMessageWrapper.classList.add("hidden");
    }
  });
}
var LoessProductGallery = class extends HTMLElement {
  constructor() {
    super();
    this.product = this.closest("loess-product");
    this.items = Array.from(this.children);
    if (this.items.length <= 1)
      return;
    this.height = this.offsetHeight;
    this.transitioning = false;
    this.changeSlide(this.querySelector("[active]"), false);
    if (this.parentHasSticky) {
      this.setupStickyScroll(this.parentElement);
    }
    this.checkFor3dModel();
  }
  async connectedCallback() {
    this.resizeObserver = new ResizeObserver(() => {
      this.setContainerHeight(this.querySelector("[active]"), false);
    }).observe(this);
    if (this.imageZoomEnabled) {
      this.addEventListener("click", () => {
        if (this.querySelector("[active]").getAttribute("media-type") != "image")
          return;
        this.zoomButton = this.parentElement.querySelector(".main-product__media-zoom-button");
        this.zoomButton.click();
      });
    }
  }
  disconnectedCallback() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.parentHasSticky) {
      this.destroyStickyScroll(this.parentElement);
    }
  }
  previousSlide(event, target) {
    event.target.nextElementSibling.removeAttribute("disabled");
    event.target.toggleAttribute("disabled", target == this.firstElementChild);
    this.changeSlide(target);
  }
  nextSlide(event, target) {
    event.target.previousElementSibling.removeAttribute("disabled");
    event.target.toggleAttribute("disabled", target == this.lastElementChild);
    this.changeSlide(target);
  }
  async changeSlide(target, animate9 = true) {
    let slide;
    if (target == null)
      return;
    if (target.hasAttribute("aria-controls")) {
      slide = this.querySelector(`#${target.getAttribute("aria-controls")}`);
    } else {
      slide = target;
    }
    this.pauseAllMedia();
    this.checkForSlideType(slide);
    this.scrollTo({
      behavior: animate9 ? "smooth" : "instant",
      left: slide.offsetLeft
    });
    this.setActiveSlide(slide);
    await this.waitForScrollEnd();
    this.setContainerHeight(slide, animate9);
    this.currentSlide = this.querySelector("[active]");
    if (this.imageZoomEnabled) {
      this.toggleImageZoomVisibility();
    }
  }
  toggleImageZoomVisibility() {
    const isImageMediaType = this.querySelector("[active]").getAttribute("media-type") == "image";
    this.parentElement.querySelector(".main-product__media-zoom-button").classList.toggle("hide", !isImageMediaType);
  }
  pauseAllMedia() {
    this.querySelectorAll("video").forEach((video) => video.pause());
    this.querySelectorAll("loess-3d-model").forEach((model) => {
      if (model.modelViewerUI)
        model.modelViewerUI.pause();
    });
    this.querySelectorAll("loess-video").forEach((video) => {
      if (video.getAttribute("type") == "native")
        return;
      if (video.getAttribute("type") === "youtube") {
        video.querySelector("iframe")?.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: "" }), "*");
      } else {
        video.querySelector("iframe")?.contentWindow.postMessage(JSON.stringify({ method: "pause" }), "*");
      }
    });
  }
  checkFor3dModel() {
    const mediaWrapper = document.querySelector("loess-3d-model");
    if (!mediaWrapper)
      return;
    this.initialModel3dId = mediaWrapper.getAttribute("model-id");
  }
  checkForSlideType(slide) {
    const slideType = slide.firstElementChild;
    const slideTagName = slideType.tagName;
    if (slideTagName == "LOESS-3D-MODEL") {
      slideType.play();
    } else if (slideTagName == "LOESS-VIDEO") {
      if (slideType.getAttribute("type") == "native") {
        slideType.querySelector("video").play();
      } else {
        slideType.play();
      }
    }
    this.updateViewButtonModelId(slideType);
  }
  updateViewButtonModelId(slideType) {
    const mediaWrapper = this.closest(".main-product__media-gallery-wrapper");
    mediaWrapper.querySelector(".product__xr-button")?.setAttribute("data-shopify-model3d-id", slideType.getAttribute("model-id") || this.initialModel3dId);
  }
  async setContainerHeight(slide, animate9) {
    const keyframes = {
      height: [`${this.height}px`, `${slide?.offsetHeight}px`]
    };
    await this.animate(keyframes, {
      duration: animate9 ? 150 : 0,
      easing: "cubic-bezier(0.5, 0, 0.175, 1)"
    }).finished;
    this.height = slide?.offsetHeight;
    this.style.height = `${this.height}px`;
    this.style.paddingBottom = "0px";
  }
  setActiveSlide(slide) {
    this.items.map((item) => item.removeAttribute("active"));
    slide.setAttribute("active", "");
  }
  waitForScrollEnd() {
    let last_changed_frame = 0;
    let last_x = this.scrollLeft;
    return new Promise((resolve) => {
      const tick = (frames) => {
        if (frames >= 500 || frames - last_changed_frame > 20) {
          resolve();
        } else {
          if (this.scrollLeft != last_x) {
            last_changed_frame = frames;
            last_x = this.scrollLeft;
          }
          requestAnimationFrame(tick.bind(null, frames + 1));
        }
      };
      tick(0);
    });
  }
  getActiveSlideIndex() {
    const activeSlide = this.querySelector("[active]");
    return [...activeSlide.parentElement.children].indexOf(activeSlide);
  }
  get imageZoomEnabled() {
    return this.getAttribute("image-zoom") === "true";
  }
  get parentHasSticky() {
    return this.parentElement.hasAttribute("sticky");
  }
};
Object.assign(LoessProductGallery.prototype, StickyScrollMixin);
if (!customElements.get("loess-product-gallery")) {
  window.customElements.define("loess-product-gallery", LoessProductGallery);
}
if (!customElements.get("loess-product-thumbnails")) {
  window.customElements.define("loess-product-thumbnails", class extends HTMLUListElement {
    constructor() {
      super();
      this.buttons = Array.from(this.children).map((child) => {
        return child.querySelector("button");
      });
      this.buttons.forEach((button) => {
        button.addEventListener("click", this.onClickButton.bind(this));
      });
      this.positionActiveThumbnail(this.buttons[0], false);
    }
    onClickButton(event) {
      this.updateThumbnailState(event.currentTarget);
      sendEvent(event.currentTarget, "product:thumbnail:clicked");
    }
    updateThumbnailState(element) {
      this.resetAriaCurrent(element);
      this.positionActiveThumbnail(element, true);
    }
    resetAriaCurrent(target) {
      this.buttons.map((button) => button.removeAttribute("aria-current"));
      target.setAttribute("aria-current", "true");
    }
    positionActiveThumbnail(target, animate9 = true) {
      this.scrollTo({
        behavior: animate9 ? "smooth" : "instant",
        top: target.offsetTop - this.clientHeight / 2 + target.clientHeight / 2,
        left: target.offsetLeft - this.clientWidth / 2 + target.clientWidth / 2
      });
    }
  }, { extends: "ul" });
}

// src/scripts/sections/popup.js
if (!customElements.get("loess-popup")) {
  window.customElements.define("loess-popup", class extends ExpandableHTMLElement {
    constructor() {
      super();
      if (window.location.pathname === "/challenge")
        return;
      if (Shopify.designMode || this._getWithExpiry("loess:theme:popup"))
        return;
      setTimeout(() => {
        this.open = true;
        this._setWithExpiry("loess:theme:popup", this.daysInSeconds);
      }, this.delayVisibility * 1e3);
    }
    connectedCallback() {
      this.toggleVisibility = this._toggleVisibility.bind(this);
      if (Shopify.designMode) {
        document.addEventListener("shopify:section:select", this.toggleVisibility);
        document.addEventListener("shopify:section:deselect", this.toggleVisibility);
      }
    }
    disconnectedCallback() {
      if (Shopify.designMode) {
        document.removeEventListener("shopify:section:select", this.toggleVisibility);
        document.removeEventListener("shopify:section:deselect", this.toggleVisibility);
      }
    }
    _setWithExpiry(key, expiration) {
      const item = {
        expiry: new Date().getTime() + expiration
      };
      localStorage.setItem(key, JSON.stringify(item));
    }
    _getWithExpiry(key) {
      const storedItem = localStorage.getItem(key);
      if (!storedItem)
        return null;
      const item = JSON.parse(storedItem);
      if (new Date().getTime() > item.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      return true;
    }
    _toggleVisibility(event) {
      if (event.detail.sectionId !== this.sectionId)
        return;
      if (event.type === "shopify:section:select") {
        this.open = true;
      } else {
        this.open = false;
      }
    }
    get daysInSeconds() {
      return this.dayFrequency * 864e5;
    }
    get sectionId() {
      return this.getAttribute("section-id");
    }
    get dayFrequency() {
      return this.getAttribute("day-frequency");
    }
    get delayVisibility() {
      return this.getAttribute("delay-visibility");
    }
  });
}

// src/scripts/sections/product-recommendations.js
var ProductRecommendations = class extends HTMLElement {
  constructor() {
    super();
    this.isLoaded = false;
  }
  connectedCallback() {
    this.initProductRecommendations();
  }
  async initProductRecommendations() {
    if (this.loaded)
      return;
    this.loaded = true;
    const section = this.closest(".shopify-section");
    const intent = this.getAttribute("intent") || "related";
    const url = `${Shopify.routes.root}recommendations/products?product_id=${this.getAttribute("product-id")}&limit=${this.getAttribute("limit") || 4}&section_id=${section.id.replace("shopify-section-", "")}&intent=${intent}`;
    const response = await fetch(url, { priority: "low" });
    const tempDiv = new DOMParser().parseFromString(await response.text(), "text/html");
    const productRecommendationsSelector = tempDiv.querySelector("loess-product-recommendations");
    if (productRecommendationsSelector.childElementCount > 0) {
      this.replaceChildren(...document.importNode(productRecommendationsSelector, true).childNodes);
    } else {
      if (intent === "related") {
        section.remove();
      } else {
        this.remove();
      }
    }
  }
};
if (!customElements.get("loess-product-recommendations")) {
  window.customElements.define("loess-product-recommendations", ProductRecommendations);
}

// src/scripts/sections/promotion.js
import { animate as animate8, inView as inView5, scroll as scroll2, stagger as stagger4 } from "@loess/vendor";
if (!customElements.get("loess-promotion")) {
  window.customElements.define("loess-promotion", class extends HTMLElement {
    constructor() {
      super();
      inView5(this, this.stagger.bind(this), { margin: `0px 0px -${this.clientHeight / 2}px 0px` });
    }
    stagger() {
      this.style.opacity = "1";
      animate8(
        this.querySelectorAll(".promotion-media-block"),
        { opacity: [0, 1], y: [20, 0] },
        { delay: stagger4(0.075) }
      );
    }
  });
}

// src/scripts/sections/recently-viewed-products.js
if (!customElements.get("loess-recently-viewed-products")) {
  customElements.define("loess-recently-viewed-products", class extends HTMLElement {
    constructor() {
      super();
      this.loaded = false;
      if (!Shopify.designMode) {
        this.collapsiblePanel = this.querySelector("loess-collapsible-panel");
        this.button = this.querySelector('button[is="loess-button"]');
        if (this.button) {
          this.setAttributesBasedOnLocalStorage();
        }
      }
    }
    connectedCallback() {
      if (Shopify.designMode)
        return;
      this.handleState = this._handleState.bind(this);
      document.addEventListener("expandable-html-element:open", this.handleState);
      document.addEventListener("expandable-html-element:close", this.handleState);
      if ("requestIdleCallback" in window) {
        requestIdleCallback(this._getProductIdSet.bind(this), { timeout: 2e3 });
      } else {
        this._getProductIdSet();
      }
    }
    disconnectedCallback() {
      document.removeEventListener("expandable-html-element:open", this.handleState);
      document.removeEventListener("expandable-html-element:close", this.handleState);
    }
    async _getProductIdSet() {
      if (this.loaded)
        return;
      this.loaded = true;
      const response = await fetch(`${this.fetchUrl}&q=${this.buildQueryString()}`);
      const div = document.createElement("div");
      div.innerHTML = await response.text();
      const recentlyViewedProductsElement = div.querySelector("loess-recently-viewed-products");
      if (recentlyViewedProductsElement.hasChildNodes()) {
        this.innerHTML = recentlyViewedProductsElement.innerHTML;
      }
      if (!Shopify.designMode) {
        this.setupClearHistoryButton();
      }
    }
    _handleState(event) {
      event.stopPropagation();
      if (event.target != this.querySelector("loess-collapsible-panel"))
        return;
      if (event.type == "expandable-html-element:open") {
        this.setLocalStorageToggle("open");
      } else {
        this.setLocalStorageToggle("");
      }
    }
    setLocalStorageToggle(status) {
      localStorage.setItem("loess:recent-products:toggle", status);
    }
    getLocalStorageToggle() {
      return localStorage.getItem("loess:recent-products:toggle");
    }
    setAttributesBasedOnLocalStorage() {
      const status = localStorage.getItem("loess:recent-products:toggle");
      if (status === "open") {
        this.button.setAttribute("aria-expanded", "true");
        this.collapsiblePanel.setAttribute("open", "");
      } else {
        this.button.setAttribute("aria-expanded", "false");
        this.collapsiblePanel.removeAttribute("open");
      }
    }
    buildQueryString() {
      const items = JSON.parse(localStorage.getItem("loess:recently-viewed-products") || "[]");
      if (this.hasAttribute("excluded-product-id") && items.includes(parseInt(this.getAttribute("excluded-product-id")))) {
        items.splice(items.indexOf(parseInt(this.getAttribute("excluded-product-id"))), 1);
      }
      return items.map((item) => "id:" + item).slice(0, 20).join(" OR ");
    }
    setupClearHistoryButton() {
      const clearHistoryButton = this.querySelector("button[clear-history]");
      if (!clearHistoryButton)
        return;
      clearHistoryButton.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear your recently viewed products?")) {
          this.style.display = "none";
          localStorage.removeItem("loess:recently-viewed-products");
        }
      }, { once: true });
    }
    get fetchUrl() {
      return this.getAttribute("fetch-url");
    }
  });
}

// src/scripts/sections/shipping-calculator.js
if (!customElements.get("loess-shipping-calculator")) {
  window.customElements.define("loess-shipping-calculator", class extends HTMLElement {
    constructor() {
      super();
      this.button = this.querySelector('button[type="button"]');
      this.button.addEventListener("click", this.calculate.bind(this));
    }
    async calculate() {
      const spinner = this.parentElement.querySelector(".shipping-rates__spinner");
      const results = this.parentElement.querySelector(".shipping-rates__results");
      this.button.setAttribute("disabled", "");
      spinner.classList.remove("hide");
      results?.remove();
      this.country = this.querySelector('[name="shipping-rates[country]"]').value;
      this.province = this.querySelector('[name="shipping-rates[province]"]').value;
      this.zip = this.querySelector('[name="shipping-rates[zip]"]').value;
      const response = await fetch(`${window.LoessTheme.routes.cart_url}/prepare_shipping_rates.json?shipping_address[country]=${this.country}&shipping_address[province]=${this.province}&shipping_address[zip]=${this.zip}`, { method: "POST" });
      if (response.ok) {
        const shippingRates = await this.getShippingRates();
        this.injectShippingRates(shippingRates);
      } else {
        const jsonError = await response.json();
        this.injectErrors(jsonError);
      }
      spinner.classList.add("hide");
      this.button.removeAttribute("disabled");
    }
    async getShippingRates() {
      const response = await fetch(`${window.LoessTheme.routes.cart_url}/async_shipping_rates.json?shipping_address[country]=${this.country}&shipping_address[province]=${this.province}&shipping_address[zip]=${this.zip}`);
      const responseText = await response.text();
      if (responseText === "null") {
        return this.getShippingRates();
      } else {
        return JSON.parse(responseText)["shipping_rates"];
      }
    }
    injectShippingRates(shippingRates) {
      let shippingRatesList = "";
      shippingRates.forEach((shippingRate) => {
        shippingRatesList += `<li>${shippingRate["presentment_name"]}: ${shippingRate["currency"]} ${shippingRate["price"]}</li>`;
      });
      const html = `
        <div class="shipping-rates__results">
          <span>${shippingRates.length === 0 ? window.LoessTheme.strings.shippingCalculatorNoResults : shippingRates.length === 1 ? window.LoessTheme.strings.shippingCalculatorOneResult : window.LoessTheme.strings.shippingCalculatorMultipleResults}</span>
          ${shippingRatesList === "" ? "" : `<ul class="shipping-rates__list caption">${shippingRatesList}</ul>`}
        </div>
      `;
      this.insertAdjacentHTML("afterend", html);
    }
    injectErrors(errors) {
      let shippingRatesList = "";
      Object.keys(errors).forEach((errorKey) => {
        shippingRatesList += `<li>${errorKey} ${errors[errorKey]}</li>`;
      });
      const html = `
        <div class="shipping-rates__results">
          <span>${window.LoessTheme.strings.shippingCalculatorError}</span>
          <ul class="shipping-rates__list caption">${shippingRatesList}</ul>
        </div>
      `;
      this.insertAdjacentHTML("afterend", html);
    }
  });
}

// src/scripts/mixins/intersection-observer.js
var IntersectionObserverMixin = {
  setupIntersectionObserver(callback, rootMargin = "0px 0px 200px 0px") {
    const handleIntersect = (entries, observer) => {
      if (!entries[0].isIntersecting)
        return;
      if (callback)
        callback();
      observer.disconnect();
    };
    new IntersectionObserver(handleIntersect.bind(this), { rootMargin }).observe(this);
  }
};

// src/scripts/sections/video.js
var LoessVideo = class extends HTMLElement {
  constructor() {
    super();
    this.loaded = false;
  }
  connectedCallback() {
    this.setupIntersectionObserver(async () => {
      this.play();
      if (this.parallax) {
        await loadScript("https://cdn.jsdelivr.net/npm/simple-parallax-js@5.6.1/dist/simpleParallax.min.js");
        await this.setupSimpleParallax();
      }
    });
    this.handleState = this._handleState.bind(this);
    document.addEventListener("expandable-html-element:open", this.handleState);
    document.addEventListener("expandable-html-element:close", this.handleState);
  }
  disconnectedCallback() {
    document.removeEventListener("expandable-html-element:open", this.handleState);
    document.removeEventListener("expandable-html-element:close", this.handleState);
  }
  setupSimpleParallax() {
    return new Promise((resolve) => {
      resolve(
        new simpleParallax(this, {
          orientation: "down",
          scale: 1.7,
          customWrapper: "[parallax]"
        })
      );
    });
  }
  _handleState(event) {
    event.stopPropagation();
    if (event.target.tagName.toLowerCase() !== "loess-modal-video")
      return;
    if (event.type == "expandable-html-element:open") {
      this.pause();
    } else {
      this.play();
    }
  }
  load() {
    return new Promise((resolve) => {
      const template = this.querySelector("template");
      const node = template.content.firstElementChild.cloneNode(true);
      node.addEventListener("load", () => {
        this.loaded = true;
        resolve();
      });
      template.replaceWith(node);
    });
  }
  async play() {
    if (!this.loaded)
      await this.load();
    const coverImage = this.querySelector(":not(iframe)") || this.nextElementSibling;
    if (coverImage)
      coverImage.style.display = "none";
    if (this.type === "youtube") {
      this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: "" }), "*");
    } else if (this.type === "vimeo") {
      this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ method: "play" }), "*");
    }
  }
  pause() {
    if (!this.loaded)
      return;
    if (this.type === "youtube") {
      this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: "" }), "*");
    } else if (this.type === "vimeo") {
      this.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ method: "pause" }), "*");
    }
  }
  get type() {
    return this.getAttribute("type");
  }
  get parallax() {
    return this.parentElement.getAttribute("parallax") === "true";
  }
};
Object.assign(LoessVideo.prototype, IntersectionObserverMixin);
if (!customElements.get("loess-video")) {
  window.customElements.define("loess-video", LoessVideo);
}
