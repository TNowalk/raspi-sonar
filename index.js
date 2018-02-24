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

  const col = db.collection('services');

  sonar.connect().then((conn) => {
    let opts = {
      service: 'raspi-sonar',
    };
    sonar.listen((msg) => {
      let data = JSON.parse(msg);

      // Search mongo to see if already tracked
      col.findOne({service: data.service}, (qErr, doc) => {
        if (qErr) {
          console.error('[MONGODB] Query failed');
        }

        if (doc) {
          // If tracked, update last heard from timestamp and write to influx
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

          col.updateOne({_id: doc._id}, doc, (uErr) => {
            if (uErr) {
              console.error('[MONGODB] Update failed');
            }
          });
        } else {
          // If not tracked, inssert into mongo and write to influx
          col.insertOne({
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

    setInterval(cleanServices,  (60 * 5 * 1000));

    function cleanServices() {
      col.find({}).toArray((err, docs) => {
        if (err) {
          return;
        }
        // Loop through each doc
        for (let i = 0, dLength = docs.length; i < dLength; i++) {
          let needsUpdate = false;
          // Loop through hosts
          for (let j = 0, hLength = docs[i].hosts.length; j < hLength; j++) {
            let interval = docs[i].hosts[j].interval;
            let minTimestamp = Date.now() - (interval * 2); // Two missed polls
            if (docs[i].hosts[j].timestamp < minTimestamp) {
              docs[i].hosts[j].pingCount = 0;
              docs[i].hosts[j].status = 'offline';
              docs[i].hosts[j].uptime = 0;
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            col.update({_id: docs[i]._id}, docs[i]);
          }
        }
      });
    }
  }).then(null, console.warn);
});
