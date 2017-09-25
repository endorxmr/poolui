'use strict';

angular.module('utils.services', [])

.service('timerService', function($interval) {
  var timer;
  var listeners = {};

  this.startTimer = function(ms) {
    timer = $interval(function() {
      _.each(listeners, function(listener) {
        listener();
      });
    }, ms);
  }

  this.stopTimer = function(){
    $interval.cancel(timer);
  }

  this.register = function(callback, key){
        // console.log("Registering requests for", key);
        return listeners[key] = callback;
      }

      this.remove = function(key){
        // console.log("Destroying requests for", key);
        delete listeners[key];
      }
    })

.service('addressService', function(dataService, timerService, $localStorage, ngAudio) {
  var addrStats = {};
  var callback;
  var storage = $localStorage;
  
  this.trackAddress = function (addr) {
    addrStats[addr] = {};
    track();
  }

  this.deleteAddress = function (key) {
    delete addrStats[key];
  };

  this.getData = function (){
    return addrStats;
  }

  this.setAlarm = function(addr, bool){
    addrStats[addr].alarm = bool;
    storage.addrStats[addr].alarm = bool;
  }

  var track = function(){
    _.each(addrStats, function(addr, key) {
      // Get Miner stats
      dataService.getData("/miner/"+key+"/stats", function(data){
        addrStats[key] = Object.assign(addr, data);

        // check and inject alarm var
        if (addr.alarm == undefined) {
          addr.alarm = false;
        }

        // Set default miner name address
        if (addr.name === undefined) {
          addr.name = key;
        }
        
        // update
        storage.addrStats = addrStats;
        callback(addrStats);
      });

      // Get miner worker ids
      dataService.getData("/miner/"+key+"/identifiers", function(minerIDs){
        addrStats[key].ids = minerIDs;
        addrStats[key].ids.sort(); // Sort by miner id
      });

      dataService.getData("/miner/"+key+"/stats/allWorkers", function(workerStats){
        addrStats[key].workerStats = workerStats;
      });

    });

  }

  this.start = function (cb){
    timerService.register(track, 'minerStats');
    addrStats = storage.addrStats || {} ;
    callback = cb;
    track(); // also run immediately
  }
})

.service('minerService', function($filter, dataService) {
  var minerStats = {};
  var callback;
  var status = true; // check pause

  this.runService = function (bool) {
    status = bool;
  }

  this.updateStats = function (addrs, callback) {

    // initalise addrs
    if(!status) return 0; 

    _.each(addrs, function (data, addr) {

      if (minerStats[addr] === undefined) minerStats[addr] = {
        dataset : {},
        options : {
          series: [],
          allSeries: [],
          axes: {
            x: {
              key: "ts",
              type: "date"
            },
            y: {
              min: 0
		    }
          }
        },
        table_selected: [],
        table_options: {
          rowSelection: true,
          multiSelect: true
        }
      };
      
         dataService.getData("/miner/"+addr+"/chart/hashrate/allWorkers", function(allWorkersData){
          _.each(allWorkersData, function (workerData, mid) {
            var sumhour = 0;
            var sumtfhour = 0;
            var j = 0;
            var k = 0;
            var hourago = Date.now() - 3600000;
            var tfhourago = Date.now() - 86400000;
            for(var i = 0 ; i < workerData.length; i++){
              if (allWorkersData[mid][i].ts > hourago) {
                  sumhour += allWorkersData[mid][i].hs;
                  j += 1;
              }
              if (allWorkersData[mid][i].ts > tfhourago) {
                  sumtfhour += allWorkersData[mid][i].hs;
                  k += 1;
              }
              allWorkersData[mid][i].ts = new Date(allWorkersData[mid][i].ts);
            }
            if (j>0) {
                allWorkersData[mid].avghshour = Math.round(sumhour/j);
            }
            if (k>0) {
                allWorkersData[mid].avghstfhour = Math.round(sumtfhour/k);
            }
            minerStats[addr].dataset[mid] = workerData;
            minerStats[addr].options.allSeries = _.unionBy(minerStats[addr].options.allSeries, [{
              axis: "y",
              id: mid,
              dataset: mid,
              label: mid,
              key: "hs",
              color: "#ff6600",
              type: ['line', 'area'],
              interpolation: { mode: "basis"},
              defined: function (value){
                  return (value !== undefined || value.x !== undefined || value.y !== undefined) ;
                }
              }], 'id');
          });

          // only display selected miners
          var selected = minerStats[addr].table_selected;
          if(minerStats[addr].table_selected.length < 1) {
            selected = _.union(minerStats[addr].table_selected, ['global']);
          }
          
          minerStats[addr].options.series = _.intersectionWith(minerStats[addr].options.allSeries, selected, function(ser, sel) { return ( ser.id == sel ) });
        });

    // report back
    callback(minerStats);

  });      
  };
});
