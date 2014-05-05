'use strict';

process.stdout.write("Loading modules: http");var http = require('http');
process.stdout.write(", url");var url  = require('url');
process.stdout.write(", path");var path = require('path');
process.stdout.write(", fs");var fs   = require('fs');
process.stdout.write(", mime");var mime = require('mime');
process.stdout.write(", os");var os   = require('os');
process.stdout.write(", zlib");var zlib = require('zlib');
process.stdout.write(", omxcontrol");var omx = require('omxcontrol');
process.stdout.write(", youtube-feeds");var youtube = require('youtube-feeds');
process.stdout.write(", child_process");var child_process = require('child_process');
process.stdout.write(", DONE!\n");

var PORT = 7000;

var nowPlaying = "";

var sseReq  = [];
var sseRes  = [];
var sseId   = [];

var queue = [];
var queueChanged = false;
var nowPlayingChanged = false;

// For XHR requests
var eventsData = {
  nowPlaying: nowPlaying,
  queue: {
    list: queue
  }
};

var queueItemCounter = 0;
var isChangingSong = false;

omx.onstop = function (wasKilled, stdout) {

  if (!wasKilled && !isChangingSong) {
    console.log("omxplayer stopped playback by itself");

    playFromQueue();

    if (queue.length === 0) {
      setNowPlaying("");
    }
  } else {
    setNowPlaying("");
  }
};


function QueueItem(params) {
  this.url = params.url;
  this.site = params.site || params.url;
  this.title = params.title || this.site;
  this.id = params.id || queueItemCounter++;
  this.yt = !!params.yt;
  this.html = this.toHTML();
}
QueueItem.prototype.toHTML = function () {
  return '<a href="'+this.site+'" target="_blank">'+this.title+'</a>';
}

function playFromQueue(cb) {

  if (!isChangingSong && queue.length > 0) {
  
    var item = removeFromQueue(0);
    isChangingSong = true;
    
    if(nowPlaying == '') {
      setNowPlaying("Changing to: " + item.toHTML());

    } else {
      setNowPlaying(nowPlaying + "</br>Changing to: " + item.toHTML());
    }

    if (item.yt) {
      console.log('getting youtube link..');
      getYoutubeUrl(item.site, function (realUrl) {
        console.log('playing '+item.title);
        omx.start(realUrl, function () {
          setNowPlaying(item.toHTML());
          if (cb) cb();
          isChangingSong = false;
        });
      });
    } else {
      console.log('playing '+item.title);
      omx.start(item.url, function () {
        setNowPlaying(item.toHTML());
        if (cb) cb();
        isChangingSong = false;
      });
    }

  } else {
    if (cb) cb();
  }
}

function addToQueue(params) {

  var item = new QueueItem(params);
  console.log("Adding "+item.title+" to the queue.");
  queue.push(item);
  var data = JSON.stringify({
    queue: {
      add: item
    }
  });
  for (var i=0; i < sseReq.length; i++) {
    sendToSSE(i, data);
  }
  if (queue.length == 1 && nowPlaying == '') {

    playFromQueue();
  }
}

function removeFromQueue(pos) {
  var item = queue.splice(pos, 1)[0];

  console.log("Removed "+item.id+" "+item.title+" from the queue.");

  var data = {
    queue: {
      remove: item.id
    }
  }
  data = JSON.stringify(data);
  for (var i=0; i < sseReq.length; i++) {
    sendToSSE(i, data);
  }

  return item;
}

function moveUpInQueue(pos) {
  if (pos > 0) {
    var item = queue[pos];
    console.log("Move up "+item.id+" "+item.title+" ("+pos+") in the queue.");
    var id = item.id;

    queue[pos] = queue[pos-1];
    queue[pos-1] = item;

    var data = JSON.stringify({
      queue: {
        moveup: id
      }
    });
    for (var i=0; i < sseReq.length; i++) {
      sendToSSE(i, data);
    }

  }
}

function setNowPlaying(np) {
  if (nowPlaying !== np) {
    nowPlaying = np;
    eventsData.nowPlaying = np;
    nowPlayingChanged = true;

    var data = {
      nowPlaying: nowPlaying
    };

    data = JSON.stringify(data);
    for (var i=0; i < sseReq.length; i++) {
      sendToSSE(i, data);
    }
  }
}

function sendToSSE(i, data) {
  sseRes[i].write("id: "+sseId[i]+"\n");
  sseRes[i].write("data: "+data+"\n\n");
}

function getYoutubeUrl(pageUrl, cb) {
  var yt = child_process.spawn("youtube-dl", ["-f", "38/37/46/22/35/34/18/6/5/17/13", "-g", pageUrl]); // Pick highest available quality
  var url = "";
  yt.stdout.on('data', function (data) {
    url += data.toString('utf8');
  });
  yt.stdout.on('close', function () {
    yt.kill();
    var realUrl = unescape(url).trim();

    cb(realUrl);

  });
}

var httpServer = http.createServer(function (req, res) {

  var uri = url.parse(req.url, true);

  var pathname = decodeURI(uri.pathname.replace(/\/\//g, "/"));
  var pathlist = pathname.substr(1).split("/");
  console.log(pathlist);
  var specialCommand = true;

  switch (pathlist[0]) {

    case 'xbmc':

      console.log("xbmc");
      res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
      res.write("Starting XBMC...");
      res.end();

      var exec = require('child_process').exec;
      exec("sudo -n -u xbmc /usr/bin/xbmc-standalone",  function(error, stdout, stderr) {
        console.log(stdout); });

      break;

    case 'omx':

      switch (pathlist[1]) {
        case 'start':
          //console.log(uri.query.path);
          omx.start(uri.query.path, function () {
            setNowPlaying('<a href="'+uri.query.path+'" target="_blank">'+(uri.query.title || uri.query.path)+'</a>');
            res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
            res.end();
          });

          break;
        case 'stop':
          console.log('stop');
          omx.stop(function () {
            setNowPlaying("");
            res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
            res.end();
          });
          break;

        case 'backward':
          console.log('backward');
          omx.backward();
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;
        case 'forward':
          console.log('forward');
          omx.forward();
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;
        case 'playpause':
          console.log('playpause');
          omx.pause();
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;
        case 'volume_up':
          console.log('volume_up');
          omx.volume_up();
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;
        case 'volume_down':
          console.log('volume_down');
          omx.volume_down();
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;
        case 'set_audio_out':
          console.log('set_audio_out='+uri.query.value);
          omx.setAudioOut(uri.query.value);
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;

        default:
          notFound(res);
          break;
      }
      break;

    case 'queue':
      switch (pathlist[1]) {
        case 'start':
          playFromQueue(function () {
            res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
            res.end();
          });
          break;

        case 'add':
          addToQueue(uri.query);
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;

        case 'remove':
          var id = parseInt(uri.query.id, 10);
          for (var i = 0; i < queue.length; i++) {
            if (queue[i].id === id) {
              removeFromQueue(i);
            }
          }
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
          break;

        case 'moveup':
          var id = parseInt(uri.query.id, 10);

          for (var i = 1; i < queue.length; i++) {
            if (queue[i].id === id) {

              moveUpInQueue(i);
              break;
            }
          }
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();

          break;
      }
      break;

    case 'listsearch':

      if((uri.query.q.indexOf("https://") == 0) ||
         (uri.query.q.indexOf("http://") == 0)) {

        console.log("List search:", uri.query.q);
        
        youtube.feeds.playlist(uri.query.q, function (result) {
          if (result.items && result.items[0])  {
            var number = result.itemsPerPage;
            number = Math.min(8,number);

            console.log("Items in playlist: ", number);

            for (var i=0; i < number; i++) {
              var video = result.items[i];
              if(!video || !video.player) continue;
              var title = video.title;
              var pageUrl = video.player.default;
              console.log("Found:", title);

              addToQueue({site: pageUrl, title: title, yt: true});
              res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
              res.end();
            }

          } else { // No result
            res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
            res.end();
          }
        });
        break;
        
      } else {
        //TODO: remove code duplication

        console.log("Building youtube playlist from keyword:", uri.query.q);

        youtube.feeds.videos( {q: uri.query.q}, function (result) {

          if (result.items && result.items[0])  {
            var number = result.itemsPerPage;
            number = Math.min(8,number);

            console.log("Items in playlist: ", number);

            for (var i=0; i < number; i++) {
              var video = result.items[i];
              if(!video || !video.player) continue;
              var title = video.title;
              var pageUrl = video.player.default;
              console.log("Found:", title);

              addToQueue({site: pageUrl, title: title, yt: true});
              res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
              res.end();
            }
            
          } else { // No result
            res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
            res.end();
          }
        });
      }
      break;

    case 'search':

      console.log("Youtube search:", uri.query.q);
      
      youtube.feeds.videos( {q: uri.query.q}, function (result) {console.log
        if (result.items && result.items[0]) {
          var video = result.items[0];

          var title = video.title;
          var pageUrl = video.player.default;
          console.log("Found:", title);

          getYoutubeUrl(pageUrl, function (realUrl) {
            addToQueue({site: pageUrl, url: realUrl, title: title});
            res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
            res.end();
          });

        } else { // No result
          // TODO: try playing via y-dl first
          addToQueue({url: uri.query.q});
          res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
          res.end();
        } 
      });
      break;

    case 'events':

      if (req.headers.accept && req.headers.accept == 'text/event-stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        var id = (new Date()).toLocaleTimeString();

        sseReq.push(req);
        sseRes.push(res);
        sseId.push(id);

        sendToSSE(sseReq.length-1, JSON.stringify(eventsData));

        var sseTimer = setInterval(function () {
          var index = sseReq.indexOf(req);
          if (index !== -1) {
            sendToSSE(index, JSON.stringify({}));
          } else {
            clearInterval(sseTimer);
          }
        }, 15*1000);

        console.log('adding SSE client');

        req.on('close', function () {
          var index = sseReq.indexOf(req);
          if (index !== -1) {
            sseReq.splice(index, 1);
            sseRes.splice(index, 1);
            sseId.splice(index, 1);
            clearInterval(sseTimer);
            console.log('removing SSE client');
          }
        });
      } else {
        res.writeHead(200, {'Content-Type': 'text/plain;charset=utf-8'});
        res.end(JSON.stringify(eventsData));
      }
      break;

    default:
      specialCommand = false;
      break;
  }
  if (specialCommand) {
    return;
  }
  httpGetFile(pathname, req, res);
});

httpServer.listen(PORT, function () {
  console.log("OMX radio on port "+PORT);
});

function getRelativePath(filepath) {
  return path.join(__dirname, filepath)
}

function notFound(res) {
  res.writeHead(404, {'Content-Type': 'text/plain;charset=utf-8'});
  res.end('404 Not found');
}

function getServerInfo () {
  return "Raspberry Pi - "+os.type()+" "+os.release()+" "+os.arch().toUpperCase()+" - Node.JS "+process.version+", "+Math.floor(process.memoryUsage().rss/1024/1024)+" MB RAM used - "+Math.floor(os.uptime()/(60*60*24))+" day(s) device uptime";
}

function httpGetFile(reqpath, req, res, skipCache) {

  var pathname = reqpath;

  if (reqpath.substr(-1) === "/") {
    pathname += "index.html";
    skipCache = true;
  }

  var filename = path.join(__dirname, './static/', pathname);
  var dirname = path.join(__dirname, './static', reqpath);

  fs.stat(filename, function (err, stats) {

    if (err) {

      if (reqpath.substr(-1) === "/") {

        fs.readdir(dirname, function (err, files) {

          if (err) {
            res.writeHead(403, {'Content-Type': 'text/html;charset=utf-8'});
            res.end('<pre>403 Not allowed to read directory contents\n<strong>'+reqpath+'</strong><hr>'+getServerInfo()+'</pre>');
            return;
          }
          res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
          res.write("<code>Listing directory <strong>"+reqpath+"</strong><br/><br/>\n\n");
          for (var i = 0; i < files.length; i++) {
            res.write("<a href=\""+files[i]+"\">"+files[i]+"</a><br/>\n")
          }
          res.write("<hr>");
          res.write(getServerInfo());
          res.end("</code>");
        });

      } else {
        res.writeHead(404, {'Content-Type': 'text/html;charset=utf-8'});
        res.end('<pre>404 Not found\n<strong>'+reqpath+'</strong><hr>'+getServerInfo()+'</pre>');
      }

      return;
    } else {

    }

    if (reqpath.substr(-1) !== "/" && stats.isDirectory()) {
      res.writeHead(302, {'Content-Type': 'text/plain;charset=utf-8', 'Location': reqpath+'/'});
      res.end('302 Redirection');
      return;
    }

    var isCached = false;

    if (req.headers['if-modified-since'] && !skipCache) {
      var req_date = new Date(req.headers['if-modified-since']);
      if (stats.mtime <= req_date && req_date <= Date.now()) {
        res.writeHead(304, {
          'Last-Modified': stats.mtime
        });
        res.end();
        isCached = true;
      }
    }
    if (!isCached) {

      var type = mime.lookup(filename);

      var headers = {
        'Content-Type': type+';charset=utf-8'
      };
      if (!skipCache) {
        headers['Last-Modified'] = stats.mtime;
      }

      var stream = fs.createReadStream(filename);
      var acceptEncoding = req.headers['accept-encoding'] || '';

      fs.readFile(filename, function (err, data) {

        function sendBody (buf) {
          headers['Content-Length'] = buf.length;
          res.writeHead(200, headers);
          res.end(buf);
        }

        if (err) {
          if (reqpath.substr(-1) !== "/") {
            res.writeHead(404, {'Content-Type': 'text/html;charset=utf-8'});
            res.end('<pre>404 Not found\n<strong>'+reqpath+'</strong>\n\nThis should not happen (dir).</pre>');
          } else {
            res.writeHead(404, {'Content-Type': 'text/html;charset=utf-8'});
            res.end('<pre>404 Not found\n<strong>'+reqpath+'</strong>\n\nThis should not happen (file).</pre>');
          }

        } else {
          if (acceptEncoding.match(/\bdeflate\b/)) {
            zlib.deflate(data, function (err, cdata) {
              if (err) {
                sendBody(data);
              } else {
                headers['Content-Encoding'] =  'deflate';
                sendBody(cdata);
              }
            });
          } else if (acceptEncoding.match(/\bgzip\b/)) {
            zlib.gzip(data, function (err, cdata) {
              if (err) {
                sendBody(data);
              } else {
                headers['Content-Encoding'] =  'gzip';
                sendBody(cdata);
              }
            });
          } else {
            sendBody(data);
          }
        }
      });
    }
  });
}
