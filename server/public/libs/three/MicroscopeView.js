MicroscopeView=function(properties) {
  THREE.Mesh.call(this);

  //Path Colors
  var NormalColors=[0x7e17e6, 0x826b99, 0x6b9977, 0xe51717, 0x4d3636, 0x6b3d99, 0x0f9932, 0xe6e6e6, 0x993d3d, 0x000000, 0x361f4d, 0x084d19, 0x999999, 0x996b6b];
  var HighlightColors=[0xe51717, 0x4d3636, 0x999999, 0x6b9977, 0x361f4d, 0x993d3d, 0x000000, 0x0f9932, 0x7e17e6, 0x826b99, 0x996b6b, 0xe6e6e6, 0x084d19, 0x6b3d99];
  this.PathColors=[];
  for(var c=0;c<NormalColors.length;c++) {
    this.PathColors.push({normal:NormalColors[c], highlight:HighlightColors[c]});
  }

  //Properties
  this.name=properties.name;
  this.width=properties.size.width; 
  this.height=properties.size.height;

  //Mouse Hover 
  var hoverProperties={
    name:'mouseHover',
    index:-1, type:'x', size:10, 
    color:0xffffff, highlightColor:0xffffff, doHighlight:false,
    point:{x:0, y:0, z:2},
  }; 
  this.mouseHover=new MyPoint(hoverProperties);
  this.mouseHover.name=hoverProperties.name;
  this.mouseHoverSize=0;//hoverProperties.size;
  this.mouseHover.toggleVisible(false);
  this.add(this.mouseHover);

  //Background
  this.material=new THREE.MeshBasicMaterial({color:properties.background.color, opacity:properties.background.opacity, transparent:true});
  this.geometry=new THREE.PlaneGeometry(properties.size.width, properties.size.height);
  this.position=new THREE.Vector3(0, 0, 0);

  //Light
  this.hasLights=false; 
  this.light=null; 
  if(properties.light!==null && properties.light!==undefined) {
    if(properties.light.hasLight) {
    this.hasLights=true; 
    if(properties.light.lightSize===null || properties.light.lightSize===undefined) {properties.light.lightSize=10;} 
    var lightProps={
      name:'squareLights', isTransparent:true, initOpacity:1.0, initColor:0xfff000,
      parentSize:{width:this.width, height:this.height},
      lightSize:{width:properties.light.lightSize, height:properties.light.lightSize},
      offsets:{x:1, y:1, z:1},
    };  
    this.lights=new MyQuadLightsMesh(lightProps);
    this.lights.debugOn(properties.light.allOn);
    this.add(this.lights);
    }
  }

  //Grid Lines	
  this.hasGridLines=false; 
  this.gridLines=null;
  if(properties.grid!==null && properties.grid!==undefined) {
    if(properties.grid.hasGrid) {
      this.hasGridLines=true;
      this.boxSize=properties.grid.boxSize;
      var geometry = new THREE.Geometry();
      var startX=this.position.x - properties.size.width*0.500;
      var startY=this.position.y - properties.size.height*0.500;
      var xLimit=properties.size.width/this.boxSize;
      for (var i=0;i<=xLimit;i++) {
        geometry.vertices.push(new THREE.Vector3(startX + this.boxSize*i, 0, startY));
        geometry.vertices.push(new THREE.Vector3(startX + this.boxSize*i, 0, startY + properties.size.height));
      }
      var yLimit=properties.size.height/this.boxSize;
      for (var i=0;i<=yLimit;i++) {
        geometry.vertices.push( new THREE.Vector3(startX, 0, startY + this.boxSize*i));
        geometry.vertices.push( new THREE.Vector3(startX + properties.size.width, 0, startY + this.boxSize*i));
      }
      var material=new THREE.LineBasicMaterial({color: 0xff0000, opacity:0.2, transparent:true});
      this.gridLines=new THREE.Line(geometry, material);
      this.gridLines.type=THREE.LinePieces;
      this.gridLines.visible=properties.grid.isVisible;
      this.gridLines.rotation.x=Math.PI*0.5;
      this.add(this.gridLines);
    }
  }
  this.resetData(properties);
};
MicroscopeView.prototype = Object.create(THREE.Mesh.prototype);
//Reset
//Reset
//Reset
//Reset
MicroscopeView.prototype.resetData=function(properties) {
  //Paths
  if(this.newPath!=null) {
    this.clearNewPath();
  } 
  this.hasPath=false; 
  this.newPath=null;
  if(properties.path!==null && properties.path!==undefined) {
    this.hasPath=true;
    this.createNewSetPath({name:properties.path.name, id:properties.path.id});
    var points=properties.path.points;
    for(var i=0;i<points.length;i++) {
      this.addPointToPath(points[i], points[i].frameNumber);
    }
  }
  //Image
  this.hasImage=false; 
  this.images=null;
  this.lightData=null;
  this.imageLightData=null;
  var setImageIndexInit=0;
  if(properties.image!==null && properties.image!==undefined) {
    if(properties.image.hasImage) {
      this.hasImage=true;
      if(properties.image.activeImage && properties.image.activeImage.frameNumber) {
        setImageIndexInit=properties.image.activeImage.frameNumber;
      }
      //Get images 
      this.images=[]; 
      for(var i=0;i<properties.image.images.length;i++) {
        properties.image.images[i].path=properties.image.basePath+'/'+properties.image.images[i].filename; 
        this.images.push(properties.image.images[i]);
      }
      //Sort Images by Time
      this.images.sort(function(a, b) {return a.frameTime-b.frameTime;});
      //Get lightData 
      this.lightData=[]; 
      this.imageLightData=[]; 
      for(var i=0;i<properties.image.lightData.length;i++) {
        var lightObj={
          frameTime:properties.image.lightData[i].frameTime,
          imageFrameNumber:properties.image.lightData[i].imageFrameNumber,
          x:properties.image.lightData[i].intensity*Math.cos(properties.image.lightData[i].angle), 
          y:properties.image.lightData[i].intensity*Math.sin(properties.image.lightData[i].angle),
        }
        this.lightData.push(lightObj);
        this.imageLightData[lightObj.imageFrameNumber]=lightObj;
      }
      //Sort lightData by Time
      this.lightData.sort(function(a, b) {return a.frameTime-b.frameTime;});
      this.imageLightData.sort(function(a, b) {return a.frameTime-b.frameTime;});
    }
  }
  
  this.currentImageFrame=0;
  this.currentTime=0;
  this.playData={};

  this.updateForImageChange(setImageIndexInit);
};


//Update
//Update
//Update
//Update
MicroscopeView.prototype.initForPlaying=function() {
  //Create Play Object
  this.playData={
    startTime:this.currentImageTime, 
    startFrame:this.currentImageFrame,
    currentTime:this.currentImageTime, 
    lightData:[],
    hasPath:false,
  };
  //Highlight path
  if(this.newPath!==null && this.newPath!==undefined) {
    this.playData.hasPath=true;
  }
  //Light Data
  for(var i=0;i<this.lightData.length;i++) {
    if(this.lightData[i].frameTime>=this.currentImageTime) {
      this.playData.lightData.push(this.lightData[i]);
    }
  }
  //Sort lght data 
  this.playData.lightData.sort(function(a, b) {return a.frameTime-b.frameTime;});
};
MicroscopeView.prototype.updateForPlaying=function(dt) {
  if(this.playData.lightData.length>0) {
    this.playData.currentTime+=dt;
    //Play LightData and Set Image
    if(this.playData.currentTime>=this.playData.lightData[0].frameTime) {
      //Check frame Change 
      if(this.currentImageFrame!=this.playData.lightData[0].imageFrameNumber) {
        //Update Current Frame
        this.currentImageFrame=this.playData.lightData[0].imageFrameNumber;
        //Set Point Highlight
        if(this.playData.hasPath) {
          this.setHighlightPoint(this.currentImageFrame);
        }
        //Load Image 
        if(this.currentImageFrame>=0 &&  this.currentImageFrame<this.images.length) {
          this.loadNewImage(this.images[this.currentImageFrame].path);
        }
      }  
      //Set light data
      if(this.hasLights) {this.setLightData(this.playData.lightData[0].x, this.playData.lightData[0].y);}
      this.playData.lightData.shift();
    }
    //Update Display info
    this.currentImageTime=this.playData.currentTime;
    this.setInfoHeader();
    
    return true;
  } else {return false;}
};

//Lights
//Lights
//Lights
//Lights
MicroscopeView.prototype.setLightData=function(x, y) {
  var l=0; var r=0; var t=0; var b=0;
  if(x>0) {l=Math.abs(x);}
  else {r=Math.abs(x);}
  if(y>0) {t=Math.abs(y);}
  else {b=Math.abs(y);}
  this.lights.setOpacity(l, r, t, b);
};

//Images
//Images
//Images
//Images
MicroscopeView.prototype.setInfoHeader=function() {
  var sec=Number(this.currentImageTime)/1000;
  document.getElementById('txtboxFrame').value='Frame: '+this.currentImageFrame;
  document.getElementById('txtboxFrame').value='Frame: '+this.currentImageFrame;
  document.getElementById('txtboxTime').value='Time: '+sec+' seconds';
  //document.getElementById('InfoHeader').innerHTML='Frame: '+this.currentImageFrame+'__________________Time: '+sec +' seconds';
};
MicroscopeView.prototype.updateForImageChange=function(imageFrameNumber) {
  var self=this;
  if(imageFrameNumber>=0 && imageFrameNumber<self.images.length) {
    var activeImage=self.images[imageFrameNumber];
    var imageLightData=self.imageLightData[imageFrameNumber];
    self.currentImageFrame=activeImage.frameNumber;
    self.currentImageTime=activeImage.frameTime;
    //Highlight 
    self.setHighlightPoint(self.currentImageFrame); 
    //Lights
    if(self.hasLights) {self.setLightData(imageLightData.x, imageLightData.y);}
    //Image
    self.loadNewImage(activeImage.path);
  }
};
MicroscopeView.prototype.loadNewImage=function(path) {
  var me=this;
  var l_imageLoaded=function () {
    //Remove Old Image 
    if(me.backgroundImage) {me.remove(me.backgroundImage);}
    //Create new Background Image
    var material=new THREE.MeshBasicMaterial({color:0xffffff, map:texture});
    me.backgroundImage=new Mesh_Image(path, texture, material, false, me.width, me.height, '');
    me.add(me.backgroundImage);
  };
  var l_imageLoadedErr=function(err) {
    console.log('loadImage ERROR: ', err);
  };
  //Load Texture
  var texture=THREE.ImageUtils.loadTexture(path, THREE.UVMapping, l_imageLoaded, l_imageLoadedErr);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
};

//SetPaths
//SetPaths
//SetPaths
//SetPaths
//SetPaths
MicroscopeView.prototype.createNewSetPath=function(props) {
  var self=this;
  var index=0;
  var pathProps={
    name:props.name, index:index, type:'x', size:6,
    color:self.PathColors[index].normal, highlightColor:self.PathColors[index].highlight,
    points:[], id:props.id,
  }; 
  this.newPath=new MyPath(pathProps);
};
MicroscopeView.prototype.addPointToPath=function(point, frameNumber) {
  var newPoint=this.newPath.addPoint(point);
  newPoint.frameNumber=frameNumber;
  this.add(newPoint); 
};
MicroscopeView.prototype.setHighlightPoint=function(imageFrameNumber) {
  if(this.newPath!==null && this.newPath!==undefined) {
    this.newPath.setHighlightPoint(imageFrameNumber);
  }
};
MicroscopeView.prototype.clearNewPath=function() {
  if(this.newPath!==null && this.newPath!==undefined) {
    for(var i=0;i<this.newPath.points.length;i++) {
      var point=this.newPath.points[i];
      this.remove(point);
    }
    this.newPath=null;
  }
};
MicroscopeView.prototype.getNewPathPoints=function() {
  var retPoints=[];
  for(var i=0;i<this.newPath.points.length;i++) {
    var pt={
      x:this.newPath.points[i].position.x, 
      y:this.newPath.points[i].position.y,
      frameNumber:this.newPath.points[i].frameNumber,
    };
    retPoints.push(pt);
  }
  return retPoints;
};

//Mouse Hover
//Mouse Hover
//Mouse Hover
//Mouse Hover
MicroscopeView.prototype.clearMousePoint=function() {
  this.mouseHover.toggleVisible(false);
};
MicroscopeView.prototype.setMousePoint=function(mousePosition) {
  this.mouseHover.toggleVisible(true);
  if(this.mouseHover!==null && this.mouseHover!==undefined) {
    this.mouseHover.setPosition({
      x:mousePosition.x+this.mouseHoverSize, 
      y:mousePosition.y+this.mouseHoverSize,
      z:this.mouseHover.position.z
    });
  }
};
