(function() {
  const initApi = () => {
    if (window.__TAURI__) {
      window.api = {
        getProps:   ()     => window.__TAURI__.core.invoke('get_props'),
        listSD:     ()     => window.__TAURI__.core.invoke('list_sd'),
        createSD:   (opts) => window.__TAURI__.core.invoke('create_sd', { opts }),
        openUrl:    (url)  => window.__TAURI__.core.invoke('open_url', { url }),
        minimize:   ()     => window.__TAURI__.core.invoke('minimize'),
        close:      ()     => window.__TAURI__.core.invoke('close'),
        onPipeline: (cb)   => {
          let unlisten;
          window.__TAURI__.event.listen('pipeline:update', (event) => {
            cb(event.payload);
          }).then(u => unlisten = u);
          return () => { if (unlisten) unlisten(); };
        },
      };
      return true;
    }
    return false;
  };
  if (!initApi()) {
    // Fallback for immediate execution if global not yet injected
    window.api = {
        getProps: async () => { while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10)); return window.__TAURI__.core.invoke('get_props'); },
        listSD: async () => { while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10)); return window.__TAURI__.core.invoke('list_sd'); },
        createSD: async (opts) => { while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10)); return window.__TAURI__.core.invoke('create_sd', { opts }); },
        openUrl: async (url) => { while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10)); return window.__TAURI__.core.invoke('open_url', { url }); },
        minimize: async () => { while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10)); return window.__TAURI__.core.invoke('minimize'); },
        close: async () => { while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10)); return window.__TAURI__.core.invoke('close'); },
        onPipeline: (cb) => {
            let unlisten;
            (async () => {
                while(!window.__TAURI__) await new Promise(r => setTimeout(r, 10));
                unlisten = await window.__TAURI__.event.listen('pipeline:update', (event) => cb(event.payload));
            })();
            return () => { if (unlisten) unlisten(); };
        }
    };
  }
})();
