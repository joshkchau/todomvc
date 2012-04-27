(function (exports) {

  "use strict";
  var store = require('redis').createClient();

  exports.addListeners = function (ModelClass, key, socket, hs) {
    var sessionID = hs.sessionID;

    // ---------------
    // Create
    //
    socket.on(key + ':create', function (data, callback) {
      var t = new ModelClass(data)
        , name = '/' + key + ':create';
      t.save(function (err) {
        socket.emit(name, t);
        socket.broadcast.emit(name, t);
      });
    });

    // ---------------
    // Read
    //
    socket.on(key + ':read', function (data, callback) {
      ModelClass.find(data._id || {}, callback);
    });

    // ---------------
    // Update
    //
    socket.on(key + ':update', function (data, callback) {
      var name, field;

      if (data && data._id) {
        field = data._id;
        name = '/' + key + '/' + field + ':update';

        // Don't do an update if the lock isn't theirs.
        store.hget(key, field, function (err, result) {
          if (!result || result === sessionID) {
            ModelClass.findById(field, function (err, result) {
              if (err) {
                callback(err, data);
              } else {
                result.title = data.title;
                result.order = data.order;
                result.done = data.done;
                result.save(function (err) {
                  socket.emit(name, result);
                  socket.broadcast.emit(name, result);
                });
              }
            });
          }
        });
      }

    });

    // ---------------
    // Delete
    //
    socket.on(key + ':delete', function (data, callback) {
      var field, name;

      if (data && data._id) {
        field = data._id;
        name = '/' + key + '/' + field + ':delete';

        // Don't delete if the record is locked.
        store.exists(key, function (err, found) {
          if (found === 0) {
            ModelClass.findById(data._id, function (err, result) {
              if (err) {
                callback(err, data);
              } else {
                if (result) {
                  result.remove();
                  result.save(function (err) {
                    socket.emit(name, result);
                    socket.broadcast.emit(name, result);
                  });
                }
              }
            });
          }
        });

      }
    });

    // ---------------
    // Lock
    //
    socket.on(key + ':lock', function (data, callback) {
      var field, name;

      if (data && data._id) {
        field = data._id;
        name = '/' + key + '/' + field + ':lock';

        store.hexists(key, field, function (err, found) {
          if (found !== 0) {
            callback(err, false);
          } else {
            store.hset(key, field, sessionID, function (err, result) {
              if (!err) {
                socket.emit(name, true);
                socket.broadcast.emit(name, true);
              }
            });
          }
        });
      }
    });

    // ---------------
    // Unlock
    //
    socket.on(key + ':unlock', function (data, callback) {
      var field, name;

      if (data && data._id) {
        field = data._id;
        name = '/' + key + '/' + field + ':unlock';

        store.hget(key, field, function (err, result) {
          if (err) {
            callback(err, false);
          } else {
            // User is only allowed to unlock the model if
            // they were the person who locked it.
            if (result === sessionID) {
              store.hdel(key, field, function (err, result) {
                socket.emit(name, true);
                socket.broadcast.emit(name, true);
              });
            }
          }
        });
      }
    });

  };

  exports.removeListeners = function (rooturl, socket) {
    socket.removeAllListeners(rooturl + ':create');
    socket.removeAllListeners(rooturl + ':read');
    socket.removeAllListeners(rooturl + ':update');
    socket.removeAllListeners(rooturl + ':delete');
    socket.removeAllListeners(rooturl + ':lock');
    socket.removeAllListeners(rooturl + ':unlock');
  };

}(exports));