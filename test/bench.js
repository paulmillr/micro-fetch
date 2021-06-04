const fetch = require('../index').default;

(async () => {
  const NUM = 10;
  let ts = Date.now();
  for (let i = 0; i < NUM; i++) await fetch('http://httpbin.org/json', { keepAlive: false });
  console.log(`HTTP Fetch ${NUM} sequential requests (keepalive=false) in ${Date.now() - ts} ms.`);
  ts = Date.now();
  for (let i = 0; i < NUM; i++) await fetch('http://httpbin.org/json');
  console.log(`HTTP Fetch ${NUM} sequential requests in ${Date.now() - ts} ms.`);
  ts = Date.now();
  for (let i = 0; i < NUM; i++) await fetch('https://httpbin.org/json', { keepAlive: false });
  console.log(`HTTPS Fetch ${NUM} sequential requests (keepalive=false) in ${Date.now() - ts} ms.`);
  ts = Date.now();
  for (let i = 0; i < NUM; i++) await fetch('https://httpbin.org/json');
  console.log(`HTTPS Fetch ${NUM} sequential requests in ${Date.now() - ts} ms.`);
})();
