#!/usr/bin/env node

let sonar = require('./lib/sonar');

if (process.env.RABBIT_URL === undefined) {
  console.error('Missing rabbit URL');
  process.exit(1);
}

sonar.connect().then((conn) => {
  let opts = {
    service: 'raspi-sonar',
  };
  sonar.pinger(opts);
  sonar.listen();
}).then(null, console.warn);
