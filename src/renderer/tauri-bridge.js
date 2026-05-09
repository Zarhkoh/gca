const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

window.api = {
    getProps: () => invoke('get_props'),
    listSD: () => invoke('list_sd'),
    createSD: (args) => invoke('create_sd', { args }),
    openUrl: (url) => invoke('open_url', { url }),
    minimize: () => window.__TAURI__.window.getCurrent().minimize(),
    close: () => window.__TAURI__.window.getCurrent().close(),
    onPipeline: (cb) => listen('pipeline:update', (event) => cb(event.payload)),
};
