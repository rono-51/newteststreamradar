// worker.js — Tick preciso de 1 segundo para StreamRadar
// Corre en segundo plano sin ser afectado por throttling del tab
let intervalId = null;

self.onmessage = function(e) {
    if (e.data === 'start') {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(() => {
            self.postMessage('tick');
        }, 1000);
    }
    if (e.data === 'stop') {
        clearInterval(intervalId);
        intervalId = null;
    }
};
