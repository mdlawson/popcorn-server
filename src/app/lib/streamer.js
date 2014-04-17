(function(App) {
    "use strict";

    var STREAM_PORT = 21584; // 'PT'!
    var BUFFERING_SIZE = 10 * 1024 * 1024;

    var readTorrent = require('read-torrent');
    var peerflix = require('peerflix');

    var engine = null;
    var statsUpdater = null;
    var active = function(wire) {
        return !wire.peerChoking;
    };


    var watchState = function(stateModel) {

        if (engine != null) {
            
            var swarm = engine.swarm;
            var state = 'connecting';

            if(swarm.downloaded > BUFFERING_SIZE) {
                state = 'ready';
            } else if(swarm.downloaded) {
                state = 'downloading';
            } else if(swarm.wires.length) {
                state = 'startingDownload';
            }

            stateModel.set('state', state);

            if(state != 'ready') {
                _.delay(watchState, 100, stateModel);
            }
        }
    };

    var handleTorrent = function(torrent, stateModel) {

        engine = peerflix(torrent, {});

        var streamInfo = new App.Model.StreamInfo({engine: engine});
        statsUpdater = setInterval(_.bind(streamInfo.updateStats, streamInfo, engine), 1000);
        stateModel.set('streamInfo', streamInfo);
        watchState(stateModel);

        var checkReady = function() {
            if(stateModel.get('state') === 'ready') {
                App.vent.trigger('stream:ready', streamInfo);
                stateModel.destroy();
            }
        };

        engine.server.on('listening', function(){
            streamInfo.set('src', 'http://127.0.0.1:' + engine.server.address().port + '/');
            stateModel.on('change:state', checkReady);
            checkReady();
        });

        engine.on('ready', function() {
            if (engine) {
                engine.server.listen();
            }
        });

        engine.on('uninterested', function() {
            if (engine) {
                engine.swarm.pause();
            }
            
        });

        engine.on('interested', function() {
            if (engine) {
                engine.swarm.resume();
            }            
        });

    };

    var Streamer = {
        start: function(torrentUrl) {
            var stateModel = new Backbone.Model({state: 'connecting'});
            App.vent.trigger('stream:started', stateModel);

            if(engine) {
                Streamer.stop();
            }

            if (/^magnet:/.test(torrentUrl)) {
                handleTorrent(torrentUrl, stateModel);
            } else {
                readTorrent(torrentUrl, function(err, torrent) {
                    if(err) {
                        App.vent.trigger('error', err);
                        App.vent.trigger('stream:stop');
                    } else {
                        handleTorrent(torrent, stateModel);
                    }
                });
            }
        },

        stop: function() {
            if (engine) {
                engine.destroy();
            }
            engine = null;
            console.log("Streaming cancelled");
        }
    };

    App.vent.on('stream:start', Streamer.start);
    App.vent.on('stream:stop', Streamer.stop);

})(window.App);