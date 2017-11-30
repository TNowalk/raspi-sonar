#!/usr/bin/env node

const MongoClient = require('mongodb').MongoClient
const sonar = require('./lib/sonar');

if (process.env.MONGODB_URL === undefined) {
  console.error('Missing mongoDB URL');
  process.exit(1);
}
if (process.env.RABBIT_URL === undefined) {
  console.error('Missing rabbit URL');
  process.exit(1);
}

MongoClient.connect(process.env.MONGODB_URL, function(err, db) {
  if (err) {
    console.error('Could not connect to MongoDB');
    process.exit(1);
  }

  sonar.connect().then((conn) => {
    let opts = {
      service: 'raspi-sonar',
    };
    sonar.listen((msg) => {
      let data = JSON.parse(msg);

      // Search mongo to see if already tracked
      db.collection('services').findOne({service: data.service}, (qErr, doc) => {
        if (qErr) {
          console.info('[MONGODB] Query failed');
        }

        if (doc) {
          // If tracked, update last heard from timestamp and write to influx
          console.log('doc', doc);
          let found = false;
          for (let i = 0; i < doc.hosts.length; i++) {
            if (doc.hosts[i].hostname === data.hostname) {
              if (isNaN(doc.hosts[i].pingCount)) {
                doc.hosts[i].pingCount = 0;
              }

              doc.hosts[i].cpuUsage = data.cpuUsage;
              doc.hosts[i].interval = data.interval;
              doc.hosts[i].memoryUsage = data.memoryUsage;
              doc.hosts[i].pingCount++;
              doc.hosts[i].status = 'online';
              doc.hosts[i].timestamp = Date.now();
              doc.hosts[i].uptime = data.uptime;

              found = true;
            }
          }

          if (!found) {
            doc.hosts.push({
              cpuUsage: data.cpuUsage,
              hostname: data.hostname,
              interval: data.interval,
              memoryUsage: data.memoryUsage,
              pingCount: 1,
              routingKey: data.routingKey,
              status: 'online',
              timestamp: Date.now(),
              uptime: data.uptime
            });
          }

          db.collection('services').updateOne({_id: doc._id}, doc, (uErr) => {
            if (uErr) {
              console.info('[MONGODB] Update failed');
            }
          });
        } else {
          // If not tracked, inssert into mongo and write to influx
          db.collection('services').insertOne({
            service: data.service,
            hosts: [{
              cpuUsage: data.cpuUsage,
              hostname: data.hostname,
              interval: data.interval,
              memoryUsage: data.memoryUsage,
              pingCount: 1,
              routingKey: data.routingKey,
              status: 'online',
              timestamp: Date.now(),
              uptime: data.uptime
            }]
          });
        }
      });
    });
    // Every 5 minutes pull down services from mongo, if last update is
      // >5 minutes then set status to offline and update status in influx
  }).then(null, console.warn);
});
