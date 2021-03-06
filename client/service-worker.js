const DEBUG_MODE = true;
const DEBUG_PREFIX = '👷';

const STATIC_CACHE_NAME = 'pwassemble-static-cache-v20170728';
const DYNAMIC_CACHE_NAME = 'pwassemble-dynamic-cache-v20170728';
const STATIC_FILES = [
  './',
  './index.html',
  './js/bundle.min.js',
  './static/yes.png',
  './static/no.png',
  './static/offline.svg',
];

const REQUEST_STRATEGIES = new Map();
const HOST = location.host.replace(/\./g, '\\.');

// Local template resources main.min.{html, js, css}
REQUEST_STRATEGIES.set(new RegExp(`${HOST}/templates`), {
  strategy: 'cacheFirst',
  cache: true,
});
// Local static resources and main bootstrapping script resources
REQUEST_STRATEGIES.set(new RegExp(`${HOST}/(?:js|static)`), {
  strategy: 'cacheFirst',
  cache: true,
});
// Local proxied remote resources to ensure HTTPS integrity
REQUEST_STRATEGIES.set(new RegExp(`${HOST}/proxy`), {
  strategy: 'networkFirst',
  cache: false,
});
// Local other resources
REQUEST_STRATEGIES.set(new RegExp(`${HOST}/\\w+`), {
  strategy: 'networkFirst',
  cache: true,
});
// Remote Google static resources
REQUEST_STRATEGIES.set(/www\.gstatic\.com/, {
  strategy: 'cacheFirst',
  cache: true,
});
// Remote Google dynamic API resources
REQUEST_STRATEGIES.set(/apis\.google\.com/, {
  strategy: 'networkFirst',
  cache: true,
});
// Remote Google dynamic API resources
REQUEST_STRATEGIES.set(/www\.googleapis\.com/, {
  strategy: 'networkFirst',
  cache: true,
});
// Remote Firebase static resources
REQUEST_STRATEGIES.set(/firebasestorage\.googleapis\.com/, {
  strategy: 'cacheFirst',
  cache: true,
});

const addToCache = (request, networkResponse) => {
  const requestUrl = request.url;
  let cache = false;
  for (let [pattern, strategyObj] of REQUEST_STRATEGIES) {
    if (pattern.test(requestUrl)) {
      cache = strategyObj.cache;
      break;
    }
  }
  if (!cache) {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Not adding to cache', requestUrl);
    }
    return;
  }
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Adding to cache', requestUrl);
  }
  return caches.open(DYNAMIC_CACHE_NAME)
  .then((cache) => {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Successfully added to cache', requestUrl);
    }
    return cache.put(request, networkResponse);
  })
  .catch((cacheError) => {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Error adding to cache', requestUrl,
          cacheError);
    }
    return Promise.reject(cacheError);
  });
};

const getCacheResponse = (request) => {
  const requestUrl = request.url;
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Fetching from cache', requestUrl);
  }
  return caches.match(request)
  .then((cacheResponse) => {
    if (!cacheResponse) {
      throw Error(requestUrl);
    }
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Successfully fetched from cache', requestUrl);
    }
    return cacheResponse;
  })
  .catch((cacheError) => {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Error fetching from cache', requestUrl);
    }
    return Promise.reject(cacheError);
  });
};

const getNetworkResponse = (request, options = {}) => {
  const requestUrl = request.url;
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX,
        `Getting from network with mode ${options && options.mode ?
        '"no-cors"' : '"cors"'}`,
        requestUrl);
  }
  return fetch(request, options)
  .then((networkResponse) => {
    if (networkResponse.type !== 'opaque' && !networkResponse.ok) {
      throw Error(requestUrl);
    }
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Successfully fetched from network',
          requestUrl);
    }
    return networkResponse;
  })
  .catch((networkError) => {
    if (Object.keys(options).length) {
      if (DEBUG_MODE) {
        console.log(DEBUG_PREFIX, 'Error fetching from network', requestUrl);
      }
      return Promise.reject(networkError);
    }
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX,
          'Error fetching from network, retrying with mode "no-cors"',
          requestUrl);
    }
    return getNetworkResponse(request, {mode: 'no-cors'});
  });
};

const getNetworkFirstResponse = (request) => {
  return getNetworkResponse(request)
  .then((networkResponse) => {
    addToCache(request, networkResponse.clone());
    return networkResponse;
  })
  .catch(() => {
    return getCacheResponse(request)
    .catch(() => Response.error());
  });
};

const getCacheFirstResponse = (request) => {
  return getCacheResponse(request)
  .catch(() => {
    return getNetworkResponse(request)
    .then((networkResponse) => {
      addToCache(request, networkResponse.clone());
      return networkResponse;
    })
    .catch(() => Response.error());
  });
};

self.addEventListener('install', (installEvent) => {
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Installed Service Worker');
  }
  installEvent.waitUntil(caches.open(STATIC_CACHE_NAME)
  .then((cache) => {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Caching app shell in', STATIC_CACHE_NAME,
          STATIC_FILES.map((f, i) => {
            return `\n\t(${i})\t→ ${f}`;
          }).join(''));
    }
    return cache.addAll(STATIC_FILES);
  })
  .then(() => {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Skip waiting on install');
    }
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', (activateEvent) => {
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Activated Service Worker');
  }
  activateEvent.waitUntil(caches.keys()
  .then((keyList) => {
    return Promise.all(keyList.map((key) => {
      if (key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
        if (DEBUG_MODE) {
          console.log(DEBUG_PREFIX, 'Removing old cache', key);
        }
        return caches.delete(key);
      }
      return true;
    }));
  })
  .then(() => {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Claiming clients');
    }
    return self.clients.claim();
  })
  .then(() => self.clients.matchAll())
  .then((clients) => {
    return caches.open(STATIC_CACHE_NAME)
    .then((cache) => {
      clients.forEach((client) => {
        const url = client.url;
        if (DEBUG_MODE) {
          console.log(DEBUG_PREFIX, 'Cached', url, 'in', STATIC_CACHE_NAME);
        }
        cache.add(url);
      });
    });
  }));
});

self.addEventListener('message', (messageEvent) => {
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Incoming message');
  }
  if (messageEvent.data.command === 'cache-self') {
    self.clients.matchAll()
    .then((clients) => {
      caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        clients.forEach((client) => {
          const url = messageEvent.data.url;
          if (DEBUG_MODE) {
            console.log(DEBUG_PREFIX, 'Cached', url, 'in', STATIC_CACHE_NAME);
          }
          cache.add(url);
        });
      });
    });
  }
});

self.addEventListener('fetch', (fetchEvent) => {
  const requestUrl = fetchEvent.request.url;
  let strategy = 'networkFirst';
  for (let [pattern, strategyObj] of REQUEST_STRATEGIES) {
    if (pattern.test(requestUrl)) {
      strategy = strategyObj.strategy;
      break;
    }
  }
  if (strategy === 'cacheFirst') {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Fetch cache first', requestUrl);
    }
    return fetchEvent.respondWith(getCacheFirstResponse(fetchEvent.request));
  } else if (strategy === 'networkFirst') {
    if (DEBUG_MODE) {
      console.log(DEBUG_PREFIX, 'Fetch network first', requestUrl);
    }
    return fetchEvent.respondWith(getNetworkFirstResponse(fetchEvent.request));
  }
});

self.addEventListener('push', (pushEvent) => {
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Push message');
  }
  pushEvent.waitUntil(fetch('push-message.json')
  .then((fetchResponse) => fetchResponse.json())
  .then((pushMessage) => {
    self.registration.showNotification(pushMessage.title, pushMessage.options);
  })
  .catch(() => {
    self.registration.showNotification('New push notification');
  }));
});

self.addEventListener('notificationclick', (notificationClickEvent) => {
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Notification click received');
  }
  notificationClickEvent.notification.close();
  notificationClickEvent.waitUntil(
      clients.openWindow('https://github.com/pwassemble/'));
});

self.addEventListener('sync', function(syncEvent) {
  if (DEBUG_MODE) {
    console.log(DEBUG_PREFIX, 'Sync event');
  }
  syncEvent.waitUntil(() => {
    return getNetworkResponse(new Request(
        'http://www.apple.com/library/test/success.html'));
  });
});
