'use strict';
//dependencies
var config = require('./config'),
    express = require('express'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    session = require('express-session'),
    mongoStore = require('connect-mongo')(session),
    http = require('http'),
    path = require('path'),
    passport = require('passport'),
    mongoose = require('mongoose'),
    helmet = require('helmet'),
    csrf = require('csurf');

var log4js=require('log4js');
var socketClient=require('socket.io-client');
//create express app
var app = express();
  
app.log4js=log4js;
//keep reference to config
app.config = config;
//setup the web server
app.server = http.createServer(app);
//setup server base path
var parts=__dirname.split('/'); 
parts.pop();
app.serverBase=''; 
parts.forEach(function(part) {app.serverBase+='/'+part;});

//setup mongoose
console.log('Connecting to database at: ' + config.mongodb.uri);
app.db = mongoose.createConnection(config.mongodb.uri);
app.db.on('error', console.error.bind(console, 'mongoose connection error: '));
  
var LOGGER_LEVELS=['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF'];
app.bpuLogLevel=LOGGER_LEVELS[4];
app.bpuExpLogLevel=LOGGER_LEVELS[4];
app.userLogLevel=LOGGER_LEVELS[4];
app.listExpLogLevel=LOGGER_LEVELS[4];
//config data models
require('../shared/mongoDb/schema/models')(app, mongoose);

//settings
app.disable('x-powered-by');
app.set('port', config.port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.pretty = true;

//middleware
//app.use(require('morgan')('dev'));
app.use(require('compression')());
app.use(require('serve-static')(path.join(__dirname, 'public')));
app.use(require('method-override')());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(config.cryptoKey));
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: config.cryptoKey,
  store: new mongoStore({ url: config.mongodb.uri })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(csrf({ cookie: { signed: true } }));
helmet(app);
app.use(helmet.frameguard('allow-from', 'www.golabz.eu'));
app.use(helmet.frameguard('allow-from', 'graasp.eu'));
app.use(helmet.frameguard('allow-from', 'shindig2.epfl.ch'));
app.use(helmet.frameguard('allow-from', 'gateway.golabz.eu'));  //browser console said not recognized directive and will be ignored

//response locals
app.use(function(req, res, next) {
  res.cookie('_csrfToken', req.csrfToken());
  res.locals.user = {};
  res.locals.user.defaultReturnUrl = req.user && req.user.defaultReturnUrl();
  res.locals.user.username = req.user && req.user.username;
  next();
});

//global locals
app.locals.projectName = app.config.projectName;
app.locals.copyrightYear = new Date().getFullYear();
app.locals.copyrightName = app.config.companyName;
app.locals.cacheBreaker = 'br34k-01';

//setup passport
require('./passport')(app, passport);

//setup routes
require('./routes')(app, passport);

//custom (friendly) error handler
app.use(require('./views/http/index').http500);

//setup utilities
app.utility = {};
app.utility.sendmail = require('./util/sendmail');
app.utility.slugify = require('./util/slugify');
app.utility.workflow = require('./util/workflow');
//listen up
console.log(app.config.port);
app.server.listen(app.config.port, function() {
  var async=require('async');

  app.myFunctions=require('../shared/myFunctions.js');
  app.mainConfig=app.config.mainConfig;
  app.bpuControllerSocket=null;
  
  var LOGGER_LEVELS=['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF'];
  var myLogger=app.log4js.getLogger('app.js'); 
  myLogger.setLevel(LOGGER_LEVELS[4]);
  myLogger.info('app.server.listen on '+app.config.port);
  app.db.once('open', function () {
    myLogger.info('app.server.listen app.db.once on '+config.mongodb.uri);
    //My Things
    app.isResortingQueue=false;
    app.isSoapChecking=false;
    app.randomIntFromInterval=function(min, max) {return Math.floor(Math.random()*(max-min+1)+min);};
    app.io=require('socket.io').listen(app.server);
    var connectToBpuController=function(callback) {
      var bpuContOpts={
        socketClientServerIP:'localhost',
        socketClientServerPort:'4200',
      };
      var addr='http://'+bpuContOpts.socketClientServerIP+':'+bpuContOpts.socketClientServerPort;  
      app.bpuControllerSocket=socketClient(addr, {multiplex:false, reconnection:true});
      app.bpuControllerSocket.on('connect', function() {
        app.bpuControllerSocket.emit('setConnection', {
          authID:'1234asdf', 
          name:'internalWebServer', 
          desc:'internal oringal web server',
          ServerPort:app.config.ServerPort,
          ServerAddr:app.config.ServerAddr,
        });
      });

      //update is joined in user socket connection
      app.bpuControllerSocket.on('update', function(bpuDocs, listExperiment, runningQueueTimesPerBpuName) {
        _compileClientUpdateFromController(bpuDocs, listExperiment, runningQueueTimesPerBpuName);
      });
      
      //Routes calls to user sockets if found
      app.bpuControllerSocket.on('activateLiveUser', function(session, liveUserConfirmTimeout, callbackToBpuController) {
        console.log('activateLiveUser', session.sessionID, session.socketID, liveUserConfirmTimeout);
        var userSocket=app.myFunctions.getSocket(app.io, session.socketID);
        if(userSocket) {
          console.log('activateLiveUser', 'found socket', app.mainConfig.userSocketStrs.activateLiveUser);
          userSocket.emit(app.mainConfig.userSocketStrs.user_activateLiveUser, session, liveUserConfirmTimeout, function(resObj) {
            console.log('activateLiveUser', session.sessionID, session.socketID, resObj.didConfirm, resObj.err);
            callbackToBpuController(resObj);
          });
        } else {
          callbackToBpuController({err:'could not find socketID', didConfirm:false});
        }
      });
      app.bpuControllerSocket.on('sendUserToLiveLab', function(session, callbackToBpuController) {
        console.log('sendUserToLiveLab', session.sessionID, session.socketID);
        var userSocket=app.myFunctions.getSocket(app.io, session.socketID);
        if(userSocket) {
          userSocket.emit(app.mainConfig.userSocketStrs.user_sendUserToLiveLab, function(resObj) {
            console.log('sendUserToLiveLab', session.sessionID, session.socketID, resObj.didConfirm, resObj.err);
            callbackToBpuController(resObj);
          });
        } else {
          callbackToBpuController({err:'could not find socketID', didConfirm:false});
        }
      });
      callback(null);
    };

    var addSocketHandler=function(callback) {
      //Socket
      app.io.sockets.on('connection', function(socket) {
        //myLogger.info('addSocketHandler socketConnectionHandler'+', '+'socketID:'+socket.id);
        console.log('addSocketHandler socketConnectionHandler'+', '+'socketID:'+socket.id);
        socket.emit(app.mainConfig.userSocketStrs.user_setConnection, function(sessDocJson) {
          //Update and find session
          var updateObj={
            lastUpdateTime:new Date().getTime(),
            isVerified:true,
            sessionID:sessDocJson.sessionID,
            socketHandle:sessDocJson.socketHandle,
            socketID:sessDocJson.socketID,
          }; 
          app.db.models.Session.findByIdAndUpdate(sessDocJson._id, updateObj, {new:true}, function(err, sessDoc) {
            if(err) {
              socket.emit(app.mainConfig.userSocketStrs.user_serverError, 'Session:'+err);
            } else if(sessDoc===null || sessDoc===undefined) {
              socket.emit(app.mainConfig.userSocketStrs.user_serverError, 'Session:'+'dne');
            } else {
              var hasLiveExp=false;
              var checkLiveExpId='fake';
              if(sessDoc.liveBpuExperiment && sessDoc.liveBpuExperiment.id) {
                checkLiveExpId=sessDoc.liveBpuExperiment.id;
              }
              app.db.models.BpuExperiment.findById(checkLiveExpId, {exp_status:1}, function(err, expDoc) {
                if(err || expDoc===null || expDoc===undefined) {
                } else {
                  if(expDoc.exp_status==='addingtobpu' || expDoc.exp_status==='running') {
                    hasLiveExp=true;
                  }
                }
                if(!hasLiveExp) {
                  sessDoc.liveBpuExperiment.id=null;
                  sessDoc.save();
                }
                socket.sessionDoc=sessDoc;
                //Allow clients to send experiment requests to bpu controller
                socket.on(app.mainConfig.userSocketStrs.user_submitExperimentRequest, function(joinQueueDataArray, callbackToClient) {
                  console.log(app.mainConfig.userSocketStrs.user_submitExperimentRequest);
                  //Emit to bpucontroller wait for exp accepted array
                  app.bpuControllerSocket.emit(app.mainConfig.socketStrs.bpuCont_submitExperimentRequest, joinQueueDataArray, function(err, resDataArray) {
                    console.log(app.mainConfig.userSocketStrs.user_submitExperimentRequest+' replied');
                    callbackToClient(err, resDataArray);
                  });
                });
                socket.on(app.mainConfig.userSocketStrs.user_ledsSet, function(setLedsData) {
                  app.bpuControllerSocket.emit(app.mainConfig.socketStrs.bpu_runExpLedsSet, setLedsData);
                });
              });
            }
          });
        });
      });
    };

    //Series Funcs
    var seriesFuncs=[];
    seriesFuncs.push(connectToBpuController);
    seriesFuncs.push(addSocketHandler);
    //Series Run 
    async.waterfall(seriesFuncs, function(err) {
      if(err) {
        myLogger.error('app.server.listen '+'asyncFinally'+' err:'+err);
      } else {
        myLogger.info('app.server.listen '+'asyncFinally');
        app.isInitialized=true;
      }
    });
  });
});

var gotupdate=0;
var _compileClientUpdateFromController=function(bpuDocs, listExperiment, runningQueueTimesPerBpuName) {
  if(gotupdate<10) {
    //gotupdate++;
  
    var waitTimePerBpuName={}; 

    var updatePerSesisonID={};
    var addBpuToSessionID=function(sessID, bpuExp) {
      if(sessID!==null && sessID!==undefined) {
        if(updatePerSesisonID[sessID]===null || updatePerSesisonID[sessID]===undefined) {
          updatePerSesisonID[sessID]={};
          updatePerSesisonID[sessID].bpuExps=[];
          updatePerSesisonID[sessID].expTags=[];
        }
        updatePerSesisonID[sessID].bpuExps.push(bpuExp);
      }
    }; 
    var addExpToSessionID=function(sessID, expTag) {
      if(sessID!==null && sessID!==undefined) {
        if(updatePerSesisonID[sessID]===null || updatePerSesisonID[sessID]===undefined) {
          updatePerSesisonID[sessID]={};
          updatePerSesisonID[sessID].bpuExps=[];
          updatePerSesisonID[sessID].expTags=[];
        }
        updatePerSesisonID[sessID].expTags.push(expTag);
      }
    }; 

    var bpuGroupsCrossCheckWithUser=function(user, bpuDoc) {
      for(var ind=0;ind<bpuDoc.allowedGroups.length;ind++) {
        for(var jnd=0;jnd<user.groups.length;jnd++) {
          if(bpuDoc.allowedGroups[ind]===user.groups[jnd]) return true;
        }
      }
      return false;
    }; 
    
    //Create bpu updates and sort active bpus experiments into session id 
    var bpusUpdate=[];
    bpuDocs.forEach(function(bpuDoc) {
      var bpuObj={
        name:bpuDoc.name, index:bpuDoc.index, 
        bpuStatus:bpuDoc.bpuStatus,
        bpu_processingTime:bpuDoc.bpu_processingTime,

        liveBpuExperiment:{
          username:bpuDoc.liveBpuExperiment.username,
          bc_timeLeft:bpuDoc.liveBpuExperiment.bc_timeLeft,
          group_experimentType:bpuDoc.liveBpuExperiment.group_experimentType,
        },
      };
      //Add to Session Update
      if(bpuObj.liveBpuExperiment) {
        addBpuToSessionID(bpuDoc.liveBpuExperiment.sessionID, JSON.parse(JSON.stringify(bpuObj)));
      }
      bpuObj.allowedGroups=bpuDoc.allowedGroups;                 //should be deleted before going out
      //Add to bpu Update
      bpusUpdate.push(bpuObj);
    });  

    //Sort Queue Exps and New Exp By sessionID
    Object.keys(listExperiment).forEach(function(key) {
      if(key[0]!=='_') {
        if(key.search('eug')>-1 || key==='newExps') {
          listExperiment[key].forEach(function(expTag) {
            if(expTag.session) {
              addExpToSessionID(expTag.session.sessionID, expTag);
            }
          });
        }
      }
    });
    //Connect session ids with sockets
    Object.keys(app.io.sockets.sockets).forEach(function(socketKey) {
      var socketID=socketKey;
      if(socketKey.split('#').length>0) socketID=socketKey.split('#')[1];
      
      var socket=app.io.sockets.sockets[socketKey];
      if(socket.sessionDoc) {
        var socketUpdateObj={
          bpuExps:[],
          queueExpTags:[],
          groupBpus:[],
        };
        if(updatePerSesisonID[socket.sessionDoc.sessionID]) {
          if(updatePerSesisonID[socket.sessionDoc.sessionID].bpuExps) {
            socketUpdateObj.bpuExps=updatePerSesisonID[socket.sessionDoc.sessionID].bpuExps;
          }
          if(updatePerSesisonID[socket.sessionDoc.sessionID].expTags) {
            socketUpdateObj.queueExpTags=updatePerSesisonID[socket.sessionDoc.sessionID].expTags;
          }
        } 
        bpuDocs.forEach(function(bpuDoc) {
          //Check if bpu is in session user groups
          if(bpuGroupsCrossCheckWithUser({groups:socket.sessionDoc.user.groups}, bpuDoc)) {
            var bpuDocJson=JSON.parse(JSON.stringify(bpuDoc));
            if(runningQueueTimesPerBpuName[bpuDoc.name]) {
              bpuDocJson.runningQueueTime=runningQueueTimesPerBpuName[bpuDoc.name];
            } else {
              bpuDocJson.runningQueueTime=0;
            }
            delete bpuDocJson.allowedGroups;
            socketUpdateObj.groupBpus.push(bpuDocJson);
          }
        });
        socket.emit('/#update', socketUpdateObj);
      }
    });
  }
};
