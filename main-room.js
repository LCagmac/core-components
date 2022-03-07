import { vueComponents } from 'https://lcagmac.github.io/vue-apps/dist/hubs.js';

/**
 * Modified from https://github.com/mozilla/hubs/blob/master/src/components/fader.js
 * to include adjustable duration and converted from component to system
 */

AFRAME.registerSystem('fader-plus', {
  schema: {
    direction: { type: 'string', default: 'none' }, // "in", "out", or "none"
    duration: { type: 'number', default: 200 }, // Transition duration in milliseconds
    color: { type: 'color', default: 'white' },
  },

  init() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({
        color: this.data.color,
        side: THREE.BackSide,
        opacity: 0,
        transparent: true,
        fog: false,
      })
    );
    mesh.scale.x = mesh.scale.y = 1;
    mesh.scale.z = 0.15;
    mesh.matrixNeedsUpdate = true;
    mesh.renderOrder = 1; // render after other transparent stuff
    this.el.camera.add(mesh);
    this.mesh = mesh;
  },

  fadeOut() {
    return this.beginTransition('out')
  },

  fadeIn() {
    return this.beginTransition('in')
  },

  async beginTransition(direction) {
    if (this._resolveFinish) {
      throw new Error('Cannot fade while a fade is happening.')
    }

    this.el.setAttribute('fader-plus', { direction });

    return new Promise((res) => {
      if (this.mesh.material.opacity === (direction == 'in' ? 0 : 1)) {
        res();
      } else {
        this._resolveFinish = res;
      }
    })
  },

  tick(t, dt) {
    const mat = this.mesh.material;
    this.mesh.visible = this.data.direction === 'out' || mat.opacity !== 0;
    if (!this.mesh.visible) return

    if (this.data.direction === 'in') {
      mat.opacity = Math.max(0, mat.opacity - (1.0 / this.data.duration) * Math.min(dt, 50));
    } else if (this.data.direction === 'out') {
      mat.opacity = Math.min(1, mat.opacity + (1.0 / this.data.duration) * Math.min(dt, 50));
    }

    if (mat.opacity === 0 || mat.opacity === 1) {
      if (this.data.direction !== 'none') {
        if (this._resolveFinish) {
          this._resolveFinish();
          this._resolveFinish = null;
        }
      }

      this.el.setAttribute('fader-plus', { direction: 'none' });
    }
  },
});

const worldCamera$1 = new THREE.Vector3();
const worldSelf$1 = new THREE.Vector3();

AFRAME.registerComponent('proximity-events', {
  schema: {
    radius: { type: 'number', default: 1 },
    fuzz: { type: 'number', default: 0.1 },
    Yoffset: { type: 'number', default: 0 },
  },
  init() {
    this.inZone = false;
    this.camera = this.el.sceneEl.camera;
  },
  tick() {
    this.camera.getWorldPosition(worldCamera$1);
    this.el.object3D.getWorldPosition(worldSelf$1);
    const wasInzone = this.inZone;

    worldCamera$1.y -= this.data.Yoffset;
    var dist = worldCamera$1.distanceTo(worldSelf$1);
    var threshold = this.data.radius + (this.inZone ? this.data.fuzz  : 0);
    this.inZone = dist < threshold;
    if (this.inZone && !wasInzone) this.el.emit('proximityenter');
    if (!this.inZone && wasInzone) this.el.emit('proximityleave');
  },
});

// Provides a global registry of running components
// copied from hubs source

function registerComponentInstance(component, name) {
    window.APP.componentRegistry = window.APP.componentRegistry || {};
    window.APP.componentRegistry[name] = window.APP.componentRegistry[name] || [];
    window.APP.componentRegistry[name].push(component);
}

function deregisterComponentInstance(component, name) {
    if (!window.APP.componentRegistry || !window.APP.componentRegistry[name]) return;
    window.APP.componentRegistry[name].splice(window.APP.componentRegistry[name].indexOf(component), 1);
}

function findAncestorWithComponent(entity, componentName) {
    while (entity && !(entity.components && entity.components[componentName])) {
        entity = entity.parentNode;
    }
    return entity;
}

/**
 * Description
 * ===========
 * break the room into quadrants of a certain size, and hide the contents of areas that have
 * nobody in them.  Media will be paused in those areas too.
 * 
 * Include a way for the portal component to turn on elements in the region of the portal before
 * it captures a cubemap
 */

 // arbitrarily choose 1000000 as the number of computed zones in  x and y
let MAX_ZONES = 1000000;
let regionTag = function(size, obj3d) {
    let pos = obj3d.position;
    let xp = Math.floor(pos.x / size) + MAX_ZONES/2;
    let zp = Math.floor(pos.z / size) + MAX_ZONES/2;
    return MAX_ZONES * xp + zp
};

let regionsInUse = [];

/**
 * Find the closest ancestor (including the passed in entity) that has an `object-region-follower` component,
 * and return that component
 */
function getRegionFollower(entity) {
    let curEntity = entity;
  
    while(curEntity && curEntity.components && !curEntity.components["object-region-follower"]) {
        curEntity = curEntity.parentNode;
    }
  
    if (!curEntity || !curEntity.components || !curEntity.components["object-region-follower"]) {
        return;
    }
    
    return curEntity.components["object-region-follower"]
}
  
function addToRegion(region) {
    regionsInUse[region] ? regionsInUse[region]++ : regionsInUse[region] = 1;
    console.log("Avatars in region " + region + ": " + regionsInUse[region]);
    if (regionsInUse[region] == 1) {
        showHideObjectsInRegion(region, true);
    } else {
        console.log("already another avatar in this region, no change");
    }
}

function subtractFromRegion(region) {
    if (regionsInUse[region]) {regionsInUse[region]--; }
    console.log("Avatars left region " + region + ": " + regionsInUse[region]);

    if (regionsInUse[region] == 0) {
        showHideObjectsInRegion(region, false);
    } else {
        console.log("still another avatar in this region, no change");
    }
}

function showRegionForObject(element) {
    let follower = getRegionFollower(element);
    if (!follower) { return }

    console.log("showing objects near " + follower.el.className);

    addToRegion(follower.region);
}

function hiderRegionForObject(element) {
    let follower = getRegionFollower(element);
    if (!follower) { return }

    console.log("hiding objects near " + follower.el.className);

    subtractFromRegion(follower.region);
}

function showHideObjects() {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ("showing/hiding all objects");
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      let visible = regionsInUse[obj.region] ? true: false;
        
      if (obj.el.object3D.visible == visible) { continue }

      console.log ((visible ? "showing " : "hiding ") + obj.el.className);
      obj.showHide(visible);
    }
  
    return null;
}

function showHideObjectsInRegion(region, visible) {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ((visible ? "showing" : "hiding") + " all objects in region " + region);
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      if (obj.region == region) {
        console.log ((visible ? "showing " : " hiding") + obj.el.className);
        obj.showHide(visible);
      }
    }
  
    return null;
}
  
AFRAME.registerComponent('avatar-region-follower', {
    schema: {
        size: { default: 10 }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D);
        console.log("Avatar: region ", this.region);
        addToRegion(this.region);

        registerComponentInstance(this, "avatar-region-follower");
    },
    remove: function() {
        deregisterComponentInstance(this, "avatar-region-follower");
        subtractFromRegion(this.region);
    },

    tick: function () {
        let newRegion = regionTag(this.data.size, this.el.object3D);
        if (newRegion != this.region) {
            subtractFromRegion(this.region);
            addToRegion(newRegion);
            this.region = newRegion;
        }
    },
});

AFRAME.registerComponent('object-region-follower', {
    schema: {
        size: { default: 10 },
        dynamic: { default: true }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D);

        this.showHide = this.showHide.bind(this);
        if (this.el.components["media-video"]) {
            this.wasPaused = this.el.components["media-video"].data.videoPaused;
        }
        registerComponentInstance(this, "object-region-follower");
    },

    remove: function() {
        deregisterComponentInstance(this, "object-region-follower");
    },

    tick: function () {
        // objects in the environment scene don't move
        if (!this.data.dynamic) { return }

        this.region = regionTag(this.data.size, this.el.object3D);

        let visible = regionsInUse[this.region] ? true: false;
        
        if (this.el.object3D.visible == visible) { return }

        // handle show/hiding the objects
        this.showHide(visible);
    },

    showHide: function (visible) {
        // handle show/hiding the objects
        this.el.object3D.visible = visible;

        /// check for media-video component on parent to see if we're a video.  Also same for audio
        if (this.el.components["media-video"]) {
            if (visible) {
                if (this.wasPaused != this.el.components["media-video"].data.videoPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            } else {
                this.wasPaused = this.el.components["media-video"].data.videoPaused;
                if (!this.wasPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            }
        }
    }
});

AFRAME.registerComponent('region-hider', {
    schema: {
        // name must follow the pattern "*_componentName"
        size: { default: 10 }
    },
    init: function () {
        // If there is a parent with "nav-mesh-helper", this is in the scene.  
        // If not, it's in an object we dropped on the window, which we don't support
        if (!findAncestorWithComponent(this.el, "nav-mesh-helper")) {
            console.warn("region-hider component must be in the environment scene glb.");
            this.size = 0;
            return;
        }
        
        if(this.data.size == 0) {
            this.data.size = 10;
            this.size = this.parseNodeName(this.data.size);
        }

        // this.newScene = this.newScene.bind(this)
        // this.el.sceneEl.addEventListener("environment-scene-loaded", this.newScene)
        // const environmentScene = document.querySelector("#environment-scene");
        // this.addSceneElement = this.addSceneElement.bind(this)
        // this.removeSceneElement = this.removeSceneElement.bind(this)
        // environmentScene.addEventListener("child-attached", this.addSceneElement)
        // environmentScene.addEventListener("child-detached", this.removeSceneElement)

        // we want to notice when new things get added to the room.  This will happen for
        // objects dropped in the room, or for new remote avatars, at least
        // this.addRootElement = this.addRootElement.bind(this)
        // this.removeRootElement = this.removeRootElement.bind(this)
        // this.el.sceneEl.addEventListener("child-attached", this.addRootElement)
        // this.el.sceneEl.addEventListener("child-detached", this.removeRootElement)

        // want to see if there are pinned objects that were loaded from hubs
        let roomObjects = document.getElementsByClassName("RoomObjects");
        this.roomObjects = roomObjects.length > 0 ? roomObjects[0] : null;

        // get avatars
        const avatars = this.el.sceneEl.querySelectorAll("[player-info]");
        avatars.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size });
        });

        // walk objects in the root (things that have been dropped on the scene)
        // - drawings have class="drawing", networked-drawing
        // Not going to do drawings right now.

        // pinned media live under a node with class="RoomObjects"
        var nodes = this.el.sceneEl.querySelectorAll(".RoomObjects > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        // - camera has camera-tool        
        // - image from camera, or dropped, has media-loader, media-image, listed-media
        // - glb has media-loader, gltf-model-plus, listed-media
        // - video has media-loader, media-video, listed-media
        //
        //  so, get all camera-tools, and media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool], a-scene > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        // walk the objects in the environment scene.  Must wait for scene to finish loading
        this.sceneLoaded = this.sceneLoaded.bind(this);
        this.el.sceneEl.addEventListener("environment-scene-loaded", this.sceneLoaded);

    },

    isAncestor: function (root, entity) {
        while (entity && !(entity == root)) {
          entity = entity.parentNode;
        }
        return (entity == root);
    },
    
    // Things we don't want to hide:
    // - [waypoint]
    // - parent of something with [navmesh] as a child (this is the navigation stuff
    // - this.el.parentEl.parentEl
    // - [skybox]
    // - [directional-light]
    // - [ambient-light]
    // - [hemisphere-light]
    // - #CombinedMesh
    // - #scene-preview-camera or [scene-preview-camera]
    //
    // we will do
    // - [media-loader]
    // - [spot-light]
    // - [point-light]
    sceneLoaded: function () {
        let nodes = document.getElementById("environment-scene").children[0].children[0];
        //var nodes = this.el.parentEl.parentEl.parentEl.childNodes;
        for (let i=0; i < nodes.length; i++) {
            let node = nodes[i];
            //if (node == this.el.parentEl.parentEl) {continue}
            if (this.isAncestor(node, this.el)) {continue}

            let cl = node.className;
            if (cl === "CombinedMesh" || cl === "scene-preview-camera") {continue}

            let c = node.components;
            if (c["waypoint"] || c["skybox"] || c["directional-light"] || c["ambient-light"] || c["hemisphere-light"]) {continue}

            let ch = node.children;
            var navmesh = false;
            for (let j=0; j < ch.length; j++) {
                if (ch[j].components["navmesh"]) {
                    navmesh = true;
                    break;
                }
            }
            if (navmesh) {continue}
            
            node.setAttribute("object-region-follower", { size: this.size, dynamic: false });
        }

        // all objects and avatar should be set up, so lets make sure all objects are correctly shown
        showHideObjects();
    },

    update: function () {
        if (this.data.size === this.size) return

        if (this.data.size == 0) {
            this.data.size = 10;
            this.size = this.parseNodeName(this.data.size);
        }
    },

    remove: function () {
        this.el.sceneEl.removeEventListener("environment-scene-loaded", this.sceneLoaded);
    },

    // per frame stuff
    tick: function (time) {
        // size == 0 is used to signal "do nothing"
        if (this.size == 0) {return}

        // see if there are new avatars
        var nodes = this.el.sceneEl.querySelectorAll("[player-info]:not([avatar-region-follower])");
        nodes.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size });
        });

        //  see if there are new camera-tools or media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]:not([object-region-follower]), a-scene > [media-loader]:not([object-region-follower])");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });
    },
  
    // newScene: function(model) {
    //     console.log("environment scene loaded: ", model)
    // },

    // addRootElement: function({ detail: { el } }) {
    //     console.log("entity added to root: ", el)
    // },

    // removeRootElement: function({ detail: { el } }) {
    //     console.log("entity removed from root: ", el)
    // },

    // addSceneElement: function({ detail: { el } }) {
    //     console.log("entity added to environment scene: ", el)
    // },

    // removeSceneElement: function({ detail: { el } }) {
    //     console.log("entity removed from environment scene: ", el)
    // },  
    
    parseNodeName: function (size) {
        // nodes should be named anything at the beginning with 
        //  "size" (an integer number)
        // at the very end.  This will set the hidder component to 
        // use that size in meters for the quadrants
        this.nodeName = this.el.parentEl.parentEl.className;

        const params = this.nodeName.match(/_([0-9]*)$/);

        // if pattern matches, we will have length of 2, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("region-hider componentName not formatted correctly: ", this.nodeName);
            return size
        } else {
            let nodeSize = parseInt(params[1]);
            if (!nodeSize) {
                return size
            } else {
                return nodeSize
            }
        }
    }
});

let DefaultHooks = {
    vertexHooks: {
        uniforms: 'insertbefore:#include <common>\n',
        functions: 'insertafter:#include <clipping_planes_pars_vertex>\n',
        preTransform: 'insertafter:#include <begin_vertex>\n',
        postTransform: 'insertafter:#include <project_vertex>\n',
        preNormal: 'insertafter:#include <beginnormal_vertex>\n'
    },
    fragmentHooks: {
        uniforms: 'insertbefore:#include <common>\n',
        functions: 'insertafter:#include <clipping_planes_pars_fragment>\n',
        preFragColor: 'insertbefore:gl_FragColor = vec4( outgoingLight, diffuseColor.a );\n',
        postFragColor: 'insertafter:gl_FragColor = vec4( outgoingLight, diffuseColor.a );\n',
        postMap: 'insertafter:#include <map_fragment>\n',
        replaceMap: 'replace:#include <map_fragment>\n'
    }
};

// based on https://github.com/jamieowen/three-material-modifier
const modifySource = (source, hookDefs, hooks) => {
    let match;
    for (let key in hookDefs) {
        if (hooks[key]) {
            match = /insert(before):(.*)|insert(after):(.*)|(replace):(.*)/.exec(hookDefs[key]);
            if (match) {
                if (match[1]) { // before
                    source = source.replace(match[2], hooks[key] + '\n' + match[2]);
                }
                else if (match[3]) { // after
                    source = source.replace(match[4], match[4] + '\n' + hooks[key]);
                }
                else if (match[5]) { // replace
                    source = source.replace(match[6], hooks[key]);
                }
            }
        }
    }
    return source;
};
// copied from three.renderers.shaders.UniformUtils.js
function cloneUniforms(src) {
    var dst = {};
    for (var u in src) {
        dst[u] = {};
        for (var p in src[u]) {
            var property = src[u][p];
            if (property && (property.isColor ||
                property.isMatrix3 || property.isMatrix4 ||
                property.isVector2 || property.isVector3 || property.isVector4 ||
                property.isTexture)) {
                dst[u][p] = property.clone();
            }
            else if (Array.isArray(property)) {
                dst[u][p] = property.slice();
            }
            else {
                dst[u][p] = property;
            }
        }
    }
    return dst;
}
let classMap = {
    MeshStandardMaterial: "standard",
    MeshBasicMaterial: "basic",
    MeshLambertMaterial: "lambert",
    MeshPhongMaterial: "phong",
    MeshDepthMaterial: "depth",
    standard: "standard",
    basic: "basic",
    lambert: "lambert",
    phong: "phong",
    depth: "depth"
};
let shaderMap;
const getShaderDef = (classOrString) => {
    if (!shaderMap) {
        let classes = {
            standard: THREE.MeshStandardMaterial,
            basic: THREE.MeshBasicMaterial,
            lambert: THREE.MeshLambertMaterial,
            phong: THREE.MeshPhongMaterial,
            depth: THREE.MeshDepthMaterial
        };
        shaderMap = {};
        for (let key in classes) {
            shaderMap[key] = {
                ShaderClass: classes[key],
                ShaderLib: THREE.ShaderLib[key],
                Key: key,
                Count: 0,
                ModifiedName: function () {
                    return `ModifiedMesh${this.Key[0].toUpperCase() + this.Key.slice(1)}Material_${++this.Count}`;
                },
                TypeCheck: `isMesh${key[0].toUpperCase() + key.slice(1)}Material`
            };
        }
    }
    let shaderDef;
    if (typeof classOrString === 'function') {
        for (let key in shaderMap) {
            if (shaderMap[key].ShaderClass === classOrString) {
                shaderDef = shaderMap[key];
                break;
            }
        }
    }
    else if (typeof classOrString === 'string') {
        let mappedClassOrString = classMap[classOrString];
        shaderDef = shaderMap[mappedClassOrString || classOrString];
    }
    if (!shaderDef) {
        throw new Error('No Shader found to modify...');
    }
    return shaderDef;
};
/**
 * The main Material Modofier
 */
class MaterialModifier {
    constructor(vertexHookDefs, fragmentHookDefs) {
        this._vertexHooks = {};
        this._fragmentHooks = {};
        if (vertexHookDefs) {
            this.defineVertexHooks(vertexHookDefs);
        }
        if (fragmentHookDefs) {
            this.defineFragmentHooks(fragmentHookDefs);
        }
    }
    modify(shader, opts) {
        let def = getShaderDef(shader);
        let vertexShader = modifySource(def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {});
        let fragmentShader = modifySource(def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {});
        let uniforms = Object.assign({}, def.ShaderLib.uniforms, opts.uniforms || {});
        return { vertexShader, fragmentShader, uniforms };
    }
    extend(shader, opts) {
        let def = getShaderDef(shader); // ADJUST THIS SHADER DEF - ONLY DEFINE ONCE - AND STORE A USE COUNT ON EXTENDED VERSIONS.
        let vertexShader = modifySource(def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {});
        let fragmentShader = modifySource(def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {});
        let uniforms = Object.assign({}, def.ShaderLib.uniforms, opts.uniforms || {});
        let ClassName = opts.className || def.ModifiedName();
        let extendMaterial = new Function('BaseClass', 'uniforms', 'vertexShader', 'fragmentShader', 'cloneUniforms', `

            let cls = class ${ClassName} extends BaseClass {
                constructor( params ){
                    super(params)
    
                    this.uniforms = cloneUniforms( uniforms );
    
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    this.setValues( params );
                }
    
                copy( source ){
    
                    super.copy(source );
    
                    this.uniforms = Object.assign( {}, source.uniforms );
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    return this;
    
                }
    
            }
            // var cls = function ${ClassName}( params ){

            //     //BaseClass.prototype.constructor.call( this, params );

            //     this.uniforms = cloneUniforms( uniforms );

            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     this.setValues( params );

            // }

            // cls.prototype = Object.create( BaseClass.prototype );
            // cls.prototype.constructor = cls;
            // cls.prototype.${def.TypeCheck} = true;

            // cls.prototype.copy = function( source ){

            //     BaseClass.prototype.copy.call( this, source );

            //     this.uniforms = Object.assign( {}, source.uniforms );
            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     return this;

            // }

            return cls;

        `);
        if (opts.postModifyVertexShader) {
            vertexShader = opts.postModifyVertexShader(vertexShader);
        }
        if (opts.postModifyFragmentShader) {
            fragmentShader = opts.postModifyFragmentShader(fragmentShader);
        }
        return extendMaterial(def.ShaderClass, uniforms, vertexShader, fragmentShader, cloneUniforms);
    }
    defineVertexHooks(defs) {
        for (let key in defs) {
            this._vertexHooks[key] = defs[key];
        }
    }
    defineFragmentHooks(defs) {
        for (let key in defs) {
            this._fragmentHooks[key] = defs[key];
        }
    }
}
let defaultMaterialModifier = new MaterialModifier(DefaultHooks.vertexHooks, DefaultHooks.fragmentHooks);

var shaderToyMain = /* glsl */ `
        // above here, the texture lookup will be done, which we
        // can disable by removing the map from the material
        // but if we leave it, we can also choose the blend the texture
        // with our shader created color, or use it in the shader or
        // whatever
        //
        // vec4 texelColor = texture2D( map, vUv );
        // texelColor = mapTexelToLinear( texelColor );
        
        vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

        if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
        if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
        if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
        uv.x = clamp(uv.x, 0.0, 1.0);
        uv.y = clamp(uv.y, 0.0, 1.0);
        
        vec4 shaderColor;
        mainImage(shaderColor, uv.xy * iResolution.xy);
        shaderColor = mapTexelToLinear( shaderColor );

        diffuseColor *= shaderColor;
`;

var shaderToyUniformObj = {
    iTime: { value: 0.0 },
    iResolution: { value: new THREE.Vector3(512, 512, 1) },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 }
};

var shaderToyUniform_paras = /* glsl */ `
uniform vec3 iResolution;
uniform float iTime;
uniform vec2 texRepeat;
uniform vec2 texOffset;
uniform int texFlipY; 
  `;

var bayerImage = "https://lcagmac.github.io/core-components/a448e34b8136fae5.png";

// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
const glsl$e = String.raw;
const uniforms$6 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$9 = new THREE.TextureLoader();
var bayerTex;
loader$9.load(bayerImage, (bayer) => {
    bayer.minFilter = THREE.NearestFilter;
    bayer.magFilter = THREE.NearestFilter;
    bayer.wrapS = THREE.RepeatWrapping;
    bayer.wrapT = THREE.RepeatWrapping;
    bayerTex = bayer;
});
let BleepyBlocksShader = {
    uniforms: uniforms$6,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$e `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$e `
      // By Daedelus: https://www.shadertoy.com/user/Daedelus
      // license: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
      #define TIMESCALE 0.25 
      #define TILES 8
      #define COLOR 0.7, 1.6, 2.8

      void mainImage( out vec4 fragColor, in vec2 fragCoord )
      {
        vec2 uv = fragCoord.xy / iResolution.xy;
        uv.x *= iResolution.x / iResolution.y;
        
        vec4 noise = texture2D(iChannel0, floor(uv * float(TILES)) / float(TILES));
        float p = 1.0 - mod(noise.r + noise.g + noise.b + iTime * float(TIMESCALE), 1.0);
        p = min(max(p * 3.0 - 1.8, 0.1), 2.0);
        
        vec2 r = mod(uv * float(TILES), 1.0);
        r = vec2(pow(r.x - 0.5, 2.0), pow(r.y - 0.5, 2.0));
        p *= 1.0 - pow(min(1.0, 12.0 * dot(r, r)), 2.0);
        
        fragColor = vec4(COLOR, 1.0) * p;
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = bayerTex;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = time * 0.001;
        material.uniforms.iChannel0.value = bayerTex;
    }
};

// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
const glsl$d = String.raw;
let NoiseShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$d `
        #define nPI 3.1415926535897932

        mat2 n_rotate2d(float angle){
                return mat2(cos(angle),-sin(angle),
                            sin(angle), cos(angle));
        }
        
        float n_stripe(float number) {
                float mod = mod(number, 2.0);
                //return step(0.5, mod)*step(1.5, mod);
                //return mod-1.0;
                return min(1.0, (smoothstep(0.0, 0.5, mod) - smoothstep(0.5, 1.0, mod))*1.0);
        }
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
                vec2 u_resolution = iResolution.xy;
                float u_time = iTime;
                vec3 color;
                vec2 st = fragCoord.xy;
                st += 2000.0 + 998000.0*step(1.75, 1.0-sin(u_time/8.0));
                st += u_time/2000.0;
                float m = (1.0+9.0*step(1.0, 1.0-sin(u_time/8.0)))/(1.0+9.0*step(1.0, 1.0-sin(u_time/16.0)));
                vec2 st1 = st * (400.0 + 1200.0*step(1.75, 1.0+sin(u_time)) - 300.0*step(1.5, 1.0+sin(u_time/3.0)));
                st = n_rotate2d(sin(st1.x)*sin(st1.y)/(m*100.0+u_time/100.0)) * st;
                vec2 st2 = st * (100.0 + 1900.0*step(1.75, 1.0-sin(u_time/2.0)));
                st = n_rotate2d(cos(st2.x)*cos(st2.y)/(m*100.0+u_time/100.0)) * st;
                st = n_rotate2d(0.5*nPI+(nPI*0.5*step( 1.0,1.0+ sin(u_time/1.0)))
                              +(nPI*0.1*step( 1.0,1.0+ cos(u_time/2.0)))+u_time*0.0001) * st;
                st *= 10.0;
                st /= u_resolution;
                color = vec3(n_stripe(st.x*u_resolution.x/10.0+u_time/10.0));
                fragColor = vec4(color, 1.0);
        }
            `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = time * 0.001;
    }
};

// from https://www.shadertoy.com/view/XdsBDB
const glsl$c = String.raw;
let LiquidMarbleShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$c `
      //// COLORS ////

      const vec3 ORANGE = vec3(1.0, 0.6, 0.2);
      const vec3 PINK   = vec3(0.7, 0.1, 0.4); 
      const vec3 BLUE   = vec3(0.0, 0.2, 0.9); 
      const vec3 BLACK  = vec3(0.0, 0.0, 0.2);
      
      ///// NOISE /////
      
      float hash( float n ) {
          //return fract(sin(n)*43758.5453123);   
          return fract(sin(n)*75728.5453123); 
      }
      
      
      float noise( in vec2 x ) {
          vec2 p = floor(x);
          vec2 f = fract(x);
          f = f*f*(3.0-2.0*f);
          float n = p.x + p.y*57.0;
          return mix(mix( hash(n + 0.0), hash(n + 1.0), f.x), mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y);
      }
      
      ////// FBM ////// 
      
      mat2 m = mat2( 0.6, 0.6, -0.6, 0.8);
      float fbm(vec2 p){
       
          float f = 0.0;
          f += 0.5000 * noise(p); p *= m * 2.02;
          f += 0.2500 * noise(p); p *= m * 2.03;
          f += 0.1250 * noise(p); p *= m * 2.01;
          f += 0.0625 * noise(p); p *= m * 2.04;
          f /= 0.9375;
          return f;
      }
      
      
      void mainImage(out vec4 fragColor, in vec2 fragCoord){
          
          // pixel ratio
          
          vec2 uv = fragCoord.xy / iResolution.xy ;  
          vec2 p = - 1. + 2. * uv;
          p.x *= iResolution.x / iResolution.y;
           
          // domains
          
          float r = sqrt(dot(p,p)); 
          float a = cos(p.y * p.x);  
                 
          // distortion
          
          float f = fbm( 5.0 * p);
          a += fbm(vec2(1.9 - p.x, 0.9 * iTime + p.y));
          a += fbm(0.4 * p);
          r += fbm(2.9 * p);
             
          // colorize
          
          vec3 col = BLUE;
          
          float ff = 1.0 - smoothstep(-0.4, 1.1, noise(vec2(0.5 * a, 3.3 * a)) );        
          col =  mix( col, ORANGE, ff);
             
          ff = 1.0 - smoothstep(.0, 2.8, r );
          col +=  mix( col, BLACK,  ff);
          
          ff -= 1.0 - smoothstep(0.3, 0.5, fbm(vec2(1.0, 40.0 * a)) ); 
          col =  mix( col, PINK,  ff);  
            
          ff = 1.0 - smoothstep(2., 2.9, a * 1.5 ); 
          col =  mix( col, BLACK,  ff);  
                                                 
          fragColor = vec4(col, 1.);
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: new THREE.Vector2(mat.map.offset.x + Math.random(), mat.map.offset.x + Math.random()) };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
    }
};

var smallNoise$1 = "https://lcagmac.github.io/core-components/cecefb50e408d105.png";

// simple shader taken from https://www.shadertoy.com/view/MslGWN
const glsl$b = String.raw;
const uniforms$5 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$8 = new THREE.TextureLoader();
var noiseTex$3;
loader$8.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$3 = noise;
});
let GalaxyShader = {
    uniforms: uniforms$5,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$b `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$b `
        //CBS
        //Parallax scrolling fractal galaxy.
        //Inspired by JoshP's Simplicity shader: https://www.shadertoy.com/view/lslGWr
        
        // http://www.fractalforums.com/new-theories-and-research/very-simple-formula-for-fractal-patterns/
        float field(in vec3 p,float s) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(iTime) * 4373.11));
            float accum = s/4.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 26; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.2));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        // Less iterations for second layer
        float field2(in vec3 p, float s) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(iTime) * 4373.11));
            float accum = s/4.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 18; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.2));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        vec3 nrand3( vec2 co )
        {
            vec3 a = fract( cos( co.x*8.3e-3 + co.y )*vec3(1.3e5, 4.7e5, 2.9e5) );
            vec3 b = fract( sin( co.x*0.3e-3 + co.y )*vec3(8.1e5, 1.0e5, 0.1e5) );
            vec3 c = mix(a, b, 0.5);
            return c;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
            vec2 uv = 2. * fragCoord.xy / iResolution.xy - 1.;
            vec2 uvs = uv * iResolution.xy / max(iResolution.x, iResolution.y);
            vec3 p = vec3(uvs / 4., 0) + vec3(1., -1.3, 0.);
            p += .2 * vec3(sin(iTime / 16.), sin(iTime / 12.),  sin(iTime / 128.));
            
            float freqs[4];
            //Sound
            freqs[0] = texture( iChannel0, vec2( 0.01, 0.25 ) ).x;
            freqs[1] = texture( iChannel0, vec2( 0.07, 0.25 ) ).x;
            freqs[2] = texture( iChannel0, vec2( 0.15, 0.25 ) ).x;
            freqs[3] = texture( iChannel0, vec2( 0.30, 0.25 ) ).x;
        
            float t = field(p,freqs[2]);
            float v = (1. - exp((abs(uv.x) - 1.) * 6.)) * (1. - exp((abs(uv.y) - 1.) * 6.));
            
            //Second Layer
            vec3 p2 = vec3(uvs / (4.+sin(iTime*0.11)*0.2+0.2+sin(iTime*0.15)*0.3+0.4), 1.5) + vec3(2., -1.3, -1.);
            p2 += 0.25 * vec3(sin(iTime / 16.), sin(iTime / 12.),  sin(iTime / 128.));
            float t2 = field2(p2,freqs[3]);
            vec4 c2 = mix(.4, 1., v) * vec4(1.3 * t2 * t2 * t2 ,1.8  * t2 * t2 , t2* freqs[0], t2);
            
            
            //Let's add some stars
            //Thanks to http://glsl.heroku.com/e#6904.0
            vec2 seed = p.xy * 2.0;	
            seed = floor(seed * iResolution.x);
            vec3 rnd = nrand3( seed );
            vec4 starcolor = vec4(pow(rnd.y,40.0));
            
            //Second Layer
            vec2 seed2 = p2.xy * 2.0;
            seed2 = floor(seed2 * iResolution.x);
            vec3 rnd2 = nrand3( seed2 );
            starcolor += vec4(pow(rnd2.y,40.0));
            
            fragColor = mix(freqs[3]-.3, 1., v) * vec4(1.5*freqs[2] * t * t* t , 1.2*freqs[1] * t * t, freqs[3]*t, 1.0)+c2+starcolor;
        }
       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$3;
        material.userData.timeOffset = (Math.random() + 0.5) * 100000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$3;
    }
};

// simple shader taken from https://www.shadertoy.com/view/4sGSzc
const glsl$a = String.raw;
const uniforms$4 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$7 = new THREE.TextureLoader();
var noiseTex$2;
loader$7.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$2 = noise;
});
let LaceTunnelShader = {
    uniforms: uniforms$4,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$a `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$a `
        // Created by Stephane Cuillerdier - Aiekick/2015 (twitter:@aiekick)
        // License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
        // Tuned via XShade (http://www.funparadigm.com/xshade/)
        
        vec2 lt_mo = vec2(0);
        
        float lt_pn( in vec3 x ) // iq noise
        {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f*f*(3.0-2.0*f);
            vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
            vec2 rg = texture(iChannel0, (uv+ 0.5)/256.0, -100.0 ).yx;
            return -1.0+2.4*mix( rg.x, rg.y, f.z );
        }
        
        vec2 lt_path(float t)
        {
            return vec2(cos(t*0.2), sin(t*0.2)) * 2.;
        }
        
        const mat3 lt_mx = mat3(1,0,0,0,7,0,0,0,7);
        const mat3 lt_my = mat3(7,0,0,0,1,0,0,0,7);
        const mat3 lt_mz = mat3(7,0,0,0,7,0,0,0,1);
        
        // base on shane tech in shader : One Tweet Cellular Pattern
        float lt_func(vec3 p)
        {
            p = fract(p/68.6) - .5;
            return min(min(abs(p.x), abs(p.y)), abs(p.z)) + 0.1;
        }
        
        vec3 lt_effect(vec3 p)
        {
            p *= lt_mz * lt_mx * lt_my * sin(p.zxy); // sin(p.zxy) is based on iq tech from shader (Sculpture III)
            return vec3(min(min(lt_func(p*lt_mx), lt_func(p*lt_my)), lt_func(p*lt_mz))/.6);
        }
        //
        
        vec4 lt_displacement(vec3 p)
        {
            vec3 col = 1.-lt_effect(p*0.8);
               col = clamp(col, -.5, 1.);
            float dist = dot(col,vec3(0.023));
            col = step(col, vec3(0.82));// black line on shape
            return vec4(dist,col);
        }
        
        vec4 lt_map(vec3 p)
        {
            p.xy -= lt_path(p.z);
            vec4 disp = lt_displacement(sin(p.zxy*2.)*0.8);
            p += sin(p.zxy*.5)*1.5;
            float l = length(p.xy) - 4.;
            return vec4(max(-l + 0.09, l) - disp.x, disp.yzw);
        }
        
        vec3 lt_nor( in vec3 pos, float prec )
        {
            vec3 eps = vec3( prec, 0., 0. );
            vec3 lt_nor = vec3(
                lt_map(pos+eps.xyy).x - lt_map(pos-eps.xyy).x,
                lt_map(pos+eps.yxy).x - lt_map(pos-eps.yxy).x,
                lt_map(pos+eps.yyx).x - lt_map(pos-eps.yyx).x );
            return normalize(lt_nor);
        }
        
        
        vec4 lt_light(vec3 ro, vec3 rd, float d, vec3 lightpos, vec3 lc)
        {
            vec3 p = ro + rd * d;
            
            // original normale
            vec3 n = lt_nor(p, 0.1);
            
            vec3 lightdir = lightpos - p;
            float lightlen = length(lightpos - p);
            lightdir /= lightlen;
            
            float amb = 0.6;
            float diff = clamp( dot( n, lightdir ), 0.0, 1.0 );
                
            vec3 brdf = vec3(0);
            brdf += amb * vec3(0.2,0.5,0.3); // color mat
            brdf += diff * 0.6;
            
            brdf = mix(brdf, lt_map(p).yzw, 0.5);// merge light and black line pattern
                
            return vec4(brdf, lightlen);
        }
        
        vec3 lt_stars(vec2 uv, vec3 rd, float d, vec2 s, vec2 g)
        {
            uv *= 800. * s.x/s.y;
            float k = fract( cos(uv.y * 0.0001 + uv.x) * 90000.);
            float var = sin(lt_pn(d*0.6+rd*182.14))*0.5+0.5;// thank to klems for the variation in my shader subluminic
            vec3 col = vec3(mix(0., 1., var*pow(k, 200.)));// come from CBS Shader "Simplicity" : https://www.shadertoy.com/view/MslGWN
            return col;
        }
        
        ////////MAIN///////////////////////////////
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 s = iResolution.xy;
            vec2 g = fragCoord;
            
           
            float time = iTime*1.0;
            float cam_a = time; // angle z
            
            float cam_e = 3.2; // elevation
            float cam_d = 4.; // distance to origin axis
            
            float maxd = 40.; // ray marching distance max
            
            vec2 uv = (g*2.-s)/s.y;
            
            vec3 col = vec3(0.);
        
            vec3 ro = vec3(lt_path(time)+lt_mo,time);
              vec3 cv = vec3(lt_path(time+0.1)+lt_mo,time+0.1);
            
            vec3 cu=vec3(0,1,0);
              vec3 rov = normalize(cv-ro);
            vec3 u = normalize(cross(cu,rov));
              vec3 v = cross(rov,u);
              vec3 rd = normalize(rov + uv.x*u + uv.y*v);
            
            vec3 curve0 = vec3(0);
            vec3 curve1 = vec3(0);
            vec3 curve2 = vec3(0);
            float outStep = 0.;
            
            float ao = 0.; // ao low cost :)
            
            float st = 0.;
            float d = 0.;
            for(int i=0;i<250;i++)
            {      
                if (st<0.025*log(d*d/st/1e5)||d>maxd) break;// special break condition for low thickness object
                st = lt_map(ro+rd*d).x;
                d += st * 0.6; // the 0.6 is selected according to the 1e5 and the 0.025 of the break condition for good result
                ao++;
            }

            if (d < maxd)
            {
                vec4 li = lt_light(ro, rd, d, ro, vec3(0));// point light on the cam
                col = li.xyz/(li.w*0.2);// cheap light attenuation
                
                   col = mix(vec3(1.-ao/100.), col, 0.5);// low cost ao :)
                fragColor.rgb = mix( col, vec3(0), 1.0-exp( -0.003*d*d ) );
            }
            else
            {
                  fragColor.rgb = lt_stars(uv, rd, d, s, fragCoord);// stars bg
            }

            // vignette
            vec2 q = fragCoord/s;
            fragColor.rgb *= 0.5 + 0.5*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.25 ); // iq vignette
                
        }
       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$2;
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$2;
    }
};

var smallNoise = "https://lcagmac.github.io/core-components/f27e0104605f0cd7.png";

// simple shader taken from https://www.shadertoy.com/view/MdfGRX
const glsl$9 = String.raw;
const uniforms$3 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannelResolution: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }
});
const loader$6 = new THREE.TextureLoader();
var noiseTex$1;
loader$6.load(smallNoise, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$1 = noise;
    console.log("noise texture size: ", noise.image.width, noise.image.height);
});
let FireTunnelShader = {
    uniforms: uniforms$3,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$9 `
      uniform sampler2D iChannel0;
      uniform vec3 iChannelResolution[4];
        `,
        functions: glsl$9 `
        // Created by inigo quilez - iq/2013
// I share this piece (art and code) here in Shadertoy and through its Public API, only for educational purposes. 
// You cannot use, sell, share or host this piece or modifications of it as part of your own commercial or non-commercial product, website or project.
// You can share a link to it or an unmodified screenshot of it provided you attribute "by Inigo Quilez, @iquilezles and iquilezles.org". 
// If you are a techer, lecturer, educator or similar and these conditions are too restrictive for your needs, please contact me and we'll work it out.

float fire_noise( in vec3 x )
{
    vec3 p = floor(x);
    vec3 f = fract(x);
	f = f*f*(3.0-2.0*f);
	
	vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
	vec2 rg = textureLod( iChannel0, (uv+ 0.5)/256.0, 0.0 ).yx;
	return mix( rg.x, rg.y, f.z );
}

vec4 fire_map( vec3 p )
{
	float den = 0.2 - p.y;

    // invert space	
	p = -7.0*p/dot(p,p);

    // twist space	
	float co = cos(den - 0.25*iTime);
	float si = sin(den - 0.25*iTime);
	p.xz = mat2(co,-si,si,co)*p.xz;

    // smoke	
	float f;
	vec3 q = p                          - vec3(0.0,1.0,0.0)*iTime;;
    f  = 0.50000*fire_noise( q ); q = q*2.02 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.25000*fire_noise( q ); q = q*2.03 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.12500*fire_noise( q ); q = q*2.01 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.06250*fire_noise( q ); q = q*2.02 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.03125*fire_noise( q );

	den = clamp( den + 4.0*f, 0.0, 1.0 );
	
	vec3 col = mix( vec3(1.0,0.9,0.8), vec3(0.4,0.15,0.1), den ) + 0.05*sin(p);
	
	return vec4( col, den );
}

vec3 raymarch( in vec3 ro, in vec3 rd, in vec2 pixel )
{
	vec4 sum = vec4( 0.0 );

	float t = 0.0;

    // dithering	
	t += 0.05*textureLod( iChannel0, pixel.xy/iChannelResolution[0].x, 0.0 ).x;
	
	for( int i=0; i<100; i++ )
	{
		if( sum.a > 0.99 ) break;
		
		vec3 pos = ro + t*rd;
		vec4 col = fire_map( pos );
		
		col.xyz *= mix( 3.1*vec3(1.0,0.5,0.05), vec3(0.48,0.53,0.5), clamp( (pos.y-0.2)/2.0, 0.0, 1.0 ) );
		
		col.a *= 0.6;
		col.rgb *= col.a;

		sum = sum + col*(1.0 - sum.a);	

		t += 0.05;
	}

	return clamp( sum.xyz, 0.0, 1.0 );
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 q = fragCoord.xy / iResolution.xy;
    vec2 p = -1.0 + 2.0*q;
    p.x *= iResolution.x/ iResolution.y;
	
    vec2 mo = vec2(0.5,0.5); //iMouse.xy / iResolution.xy;
    //if( iMouse.w<=0.00001 ) mo=vec2(0.0);
	
    // camera
    vec3 ro = 4.0*normalize(vec3(cos(3.0*mo.x), 1.4 - 1.0*(mo.y-.1), sin(3.0*mo.x)));
	vec3 ta = vec3(0.0, 1.0, 0.0);
	float cr = 0.5*cos(0.7*iTime);
	
    // shake		
	ro += 0.1*(-1.0+2.0*textureLod( iChannel0, iTime*vec2(0.010,0.014), 0.0 ).xyz);
	ta += 0.1*(-1.0+2.0*textureLod( iChannel0, iTime*vec2(0.013,0.008), 0.0 ).xyz);
	
	// build ray
    vec3 ww = normalize( ta - ro);
    vec3 uu = normalize(cross( vec3(sin(cr),cos(cr),0.0), ww ));
    vec3 vv = normalize(cross(ww,uu));
    vec3 rd = normalize( p.x*uu + p.y*vv + 2.0*ww );
	
    // raymarch	
	vec3 col = raymarch( ro, rd, fragCoord );
	
	// contrast and vignetting	
	col = col*0.5 + 0.5*col*col*(3.0-2.0*col);
	col *= 0.25 + 0.75*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.1 );
	
    fragColor = vec4( col, 1.0 );
}

       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$1;
        material.userData.timeOffset = (Math.random() + 0.5) * 100000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$1;
        material.uniforms.iChannelResolution.value[0].x = noiseTex$1.image.width;
        material.uniforms.iChannelResolution.value[0].y = noiseTex$1.image.height;
    }
};

// simple shader taken from https://www.shadertoy.com/view/7lfXRB
const glsl$8 = String.raw;
let MistShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$8 `

        float mrand(vec2 coords)
        {
            return fract(sin(dot(coords, vec2(56.3456,78.3456)) * 5.0) * 10000.0);
        }
        
        float mnoise(vec2 coords)
        {
            vec2 i = floor(coords);
            vec2 f = fract(coords);
        
            float a = mrand(i);
            float b = mrand(i + vec2(1.0, 0.0));
            float c = mrand(i + vec2(0.0, 1.0));
            float d = mrand(i + vec2(1.0, 1.0));
        
            vec2 cubic = f * f * (3.0 - 2.0 * f);
        
            return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
        }
        
        float fbm(vec2 coords)
        {
            float value = 0.0;
            float scale = 0.5;
        
            for (int i = 0; i < 10; i++)
            {
                value += mnoise(coords) * scale;
                coords *= 4.0;
                scale *= 0.5;
            }
        
            return value;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.y * 2.0;
         
            float final = 0.0;
            
            for (int i =1; i < 6; i++)
            {
                vec2 motion = vec2(fbm(uv + vec2(0.0,iTime) * 0.05 + vec2(i, 0.0)));
        
                final += fbm(uv + motion);
        
            }
            
            final /= 5.0;
            fragColor = vec4(mix(vec3(-0.3), vec3(0.45, 0.4, 0.6) + vec3(0.6), final), 1);
        }
    `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.0012) + material.userData.timeOffset;
    }
};

const glsl$7 = String.raw;
const state = {
    animate: false,
    noiseMode: 'scale',
    invert: false,
    sharpen: true,
    scaleByPrev: false,
    gain: 0.54,
    lacunarity: 2.0,
    octaves: 5,
    scale1: 3.0,
    scale2: 3.0,
    timeScaleX: 0.4,
    timeScaleY: 0.3,
    color1: [0, 0, 0],
    color2: [130, 129, 129],
    color3: [110, 110, 110],
    color4: [82, 51, 13],
    offsetAX: 0,
    offsetAY: 0,
    offsetBX: 3.7,
    offsetBY: 0.9,
    offsetCX: 2.1,
    offsetCY: 3.2,
    offsetDX: 4.3,
    offsetDY: 2.8,
    offsetX: 0,
    offsetY: 0,
};
let Marble1Shader = {
    uniforms: {
        mb_animate: { value: state.animate },
        mb_color1: { value: state.color1.map(c => c / 255) },
        mb_color2: { value: state.color2.map(c => c / 255) },
        mb_color3: { value: state.color3.map(c => c / 255) },
        mb_color4: { value: state.color4.map(c => c / 255) },
        mb_gain: { value: state.gain },
        mb_invert: { value: state.invert },
        mb_lacunarity: { value: state.lacunarity },
        mb_noiseMode: { value: 0  },
        mb_octaves: { value: state.octaves },
        mb_offset: { value: [state.offsetX, state.offsetY] },
        mb_offsetA: { value: [state.offsetAX, state.offsetAY] },
        mb_offsetB: { value: [state.offsetBX, state.offsetBY] },
        mb_offsetC: { value: [state.offsetCX, state.offsetCY] },
        mb_offsetD: { value: [state.offsetDX, state.offsetDY] },
        mb_scale1: { value: state.scale1 },
        mb_scale2: { value: state.scale2 },
        mb_scaleByPrev: { value: state.scaleByPrev },
        mb_sharpen: { value: state.sharpen },
        mb_time: { value: 0 },
        mb_timeScale: { value: [state.timeScaleX, state.timeScaleY] },
        texRepeat: { value: new THREE.Vector2(1, 1) },
        texOffset: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: {},
    fragmentShader: {
        uniforms: glsl$7 `
            uniform bool mb_animate;
            uniform vec3 mb_color1;
            uniform vec3 mb_color2;
            uniform vec3 mb_color3;
            uniform vec3 mb_color4;
            uniform float mb_gain;
            uniform bool mb_invert;
            uniform float mb_lacunarity;
            uniform int mb_noiseMode;
            uniform int mb_octaves;
            uniform vec2 mb_offset;
            uniform vec2 mb_offsetA;
            uniform vec2 mb_offsetB;
            uniform vec2 mb_offsetC;
            uniform vec2 mb_offsetD;
            uniform float mb_scale1;
            uniform float mb_scale2;
            uniform bool mb_scaleByPrev;
            uniform bool mb_sharpen;
            uniform float mb_time;
            uniform vec2 mb_timeScale;
            uniform vec2 texRepeat;
            uniform vec2 texOffset;
                    `,
        functions: glsl$7 `
        // Some useful functions
        vec3 mb_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mb_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 mb_permute(vec3 x) { return mb_mod289(((x*34.0)+1.0)*x); }
        
        //
        // Description : GLSL 2D simplex noise function
        //      Author : Ian McEwan, Ashima Arts
        //  Maintainer : ijm
        //     Lastmod : 20110822 (ijm)
        //     License :
        //  Copyright (C) 2011 Ashima Arts. All rights reserved.
        //  Distributed under the MIT License. See LICENSE file.
        //  https://github.com/ashima/webgl-noise
        //
        float mb_snoise(vec2 v) {
            // Precompute values for skewed triangular grid
            const vec4 C = vec4(0.211324865405187,
                                // (3.0-sqrt(3.0))/6.0
                                0.366025403784439,
                                // 0.5*(sqrt(3.0)-1.0)
                                -0.577350269189626,
                                // -1.0 + 2.0 * C.x
                                0.024390243902439);
                                // 1.0 / 41.0
        
            // First corner (x0)
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
        
            // Other two corners (x1, x2)
            vec2 i1 = vec2(0.0);
            i1 = (x0.x > x0.y)? vec2(1.0, 0.0):vec2(0.0, 1.0);
            vec2 x1 = x0.xy + C.xx - i1;
            vec2 x2 = x0.xy + C.zz;
        
            // Do some permutations to avoid
            // truncation effects in permutation
            i = mb_mod289(i);
            vec3 p = mb_permute(
                    mb_permute( i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0 ));
        
            vec3 m = max(0.5 - vec3(
                                dot(x0,x0),
                                dot(x1,x1),
                                dot(x2,x2)
                                ), 0.0);
        
            m = m*m;
            m = m*m;
        
            // Gradients:
            //  41 pts uniformly over a line, mapped onto a diamond
            //  The ring size 17*17 = 289 is close to a multiple
            //      of 41 (41*7 = 287)
        
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
        
            // Normalise gradients implicitly by scaling m
            // Approximation of: m *= inversesqrt(a0*a0 + h*h);
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0+h*h);
        
            // Compute final noise value at P
            vec3 g = vec3(0.0);
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * vec2(x1.x,x2.x) + h.yz * vec2(x1.y,x2.y);
            return 130.0 * dot(m, g);
        }
        
        float mb_getNoiseVal(vec2 p) {
            float raw = mb_snoise(p);
        
            if (mb_noiseMode == 1) {
                return abs(raw);
            }
        
            return raw * 0.5 + 0.5;
        }
        
        float mb_fbm(vec2 p) {
            float sum = 0.0;
            float freq = 1.0;
            float amp = 0.5;
            float prev = 1.0;
        
            for (int i = 0; i < mb_octaves; i++) {
                float n = mb_getNoiseVal(p * freq);
        
                if (mb_invert) {
                    n = 1.0 - n;
                }
        
                if (mb_sharpen) {
                    n = n * n;
                }
        
                sum += n * amp;
        
                if (mb_scaleByPrev) {
                    sum += n * amp * prev;
                }
        
                prev = n;
                freq *= mb_lacunarity;
                amp *= mb_gain;
            }
        
            return sum;
        }
        
        float mb_pattern(in vec2 p, out vec2 q, out vec2 r) {
            p *= mb_scale1;
            p += mb_offset;
        
            float t = 0.0;
            if (mb_animate) {
                t = mb_time * 0.1;
            }
        
            q = vec2(mb_fbm(p + mb_offsetA + t * mb_timeScale.x), mb_fbm(p + mb_offsetB - t * mb_timeScale.y));
            r = vec2(mb_fbm(p + mb_scale2 * q + mb_offsetC), mb_fbm(p + mb_scale2 * q + mb_offsetD));
        
            return mb_fbm(p + mb_scale2 * r);
        }
    `,
        replaceMap: glsl$7 `
        vec3 marbleColor = vec3(0.0);

        vec2 q;
        vec2 r;

        vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); 
        if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
        if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
        uv.x = clamp(uv.x, 0.0, 1.0);
        uv.y = clamp(uv.y, 0.0, 1.0);

        float f = mb_pattern(uv, q, r);
        
        marbleColor = mix(mb_color1, mb_color2, f);
        marbleColor = mix(marbleColor, mb_color3, length(q) / 2.0);
        marbleColor = mix(marbleColor, mb_color4, r.y / 2.0);

        vec4 marbleColor4 = mapTexelToLinear( vec4(marbleColor,1.0) );

        diffuseColor *= marbleColor4;
    `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.mb_invert = { value: mat.map.flipY ? state.invert : !state.invert };
        material.uniforms.mb_offsetA = { value: new THREE.Vector2(state.offsetAX + Math.random(), state.offsetAY + Math.random()) };
        material.uniforms.mb_offsetB = { value: new THREE.Vector2(state.offsetBX + Math.random(), state.offsetBY + Math.random()) };
    },
    updateUniforms: function (time, material) {
        material.uniforms.mb_time.value = time * 0.001;
    }
};

var notFound = "https://lcagmac.github.io/core-components/1ec965c5d6df577c.jpg";

// simple shader taken from https://www.shadertoy.com/view/4t33z8
const glsl$6 = String.raw;
const uniforms$2 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannel1: { value: null }
});
const loader$5 = new THREE.TextureLoader();
var noiseTex;
loader$5.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex = noise;
});
var notFoundTex;
loader$5.load(notFound, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    notFoundTex = noise;
});
let NotFoundShader = {
    uniforms: uniforms$2,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$6 `
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        `,
        functions: glsl$6 `
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.xy;
            vec2 warpUV = 2. * uv;
        
            float d = length( warpUV );
            vec2 st = warpUV*0.1 + 0.2*vec2(cos(0.071*iTime*2.+d),
                                        sin(0.073*iTime*2.-d));
        
            vec3 warpedCol = texture( iChannel0, st ).xyz * 2.0;
            float w = max( warpedCol.r, 0.85);
            
            vec2 offset = 0.01 * cos( warpedCol.rg * 3.14159 );
            vec3 col = texture( iChannel1, uv + offset ).rgb * vec3(0.8, 0.8, 1.5) ;
            col *= w*1.2;
            
            fragColor = vec4( mix(col, texture( iChannel1, uv + offset ).rgb, 0.5),  1.0);
        }
        `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex;
        material.uniforms.iChannel1.value = notFoundTex;
        material.userData.timeOffset = (Math.random() + 0.5) * 10000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex;
        material.uniforms.iChannel1.value = notFoundTex;
    }
};

var warpfx = "https://lcagmac.github.io/core-components/481a92b44e56dad4.png";

const glsl$5 = String.raw;
const uniforms$1 = {
    warpTime: { value: 0 },
    warpTex: { value: null },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 }
};
const loader$4 = new THREE.TextureLoader();
var warpTex$1;
loader$4.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestFilter;
    warp.magFilter = THREE.NearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex$1 = warp;
});
let WarpShader = {
    uniforms: uniforms$1,
    vertexShader: {},
    fragmentShader: {
        uniforms: glsl$5 `
        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 
                `,
        replaceMap: glsl$5 `
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));
          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          
          col = mapTexelToLinear( col );
          diffuseColor *= col;
        `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
        material.uniforms.warpTex.value = warpTex$1;
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.warpTex.value = warpTex$1;
    }
};

/*
 * 3D Simplex noise
 * SIGNATURE: float snoise(vec3 v)
 * https://github.com/hughsk/glsl-noise
 */
const glsl$4 = `
//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
  }  
`;

const glsl$3 = String.raw;
const uniforms = {
    warpTime: { value: 0 },
    warpTex: { value: null },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 },
    portalCubeMap: { value: new THREE.CubeTexture() },
    portalTime: { value: 0 },
    portalRadius: { value: 0.5 },
    portalRingColor: { value: new THREE.Color("red") },
    invertWarpColor: { value: 0 },
    texInvSize: { value: new THREE.Vector2(1, 1) }
};
let cubeMap = new THREE.CubeTexture();
const loader$3 = new THREE.TextureLoader();
var warpTex;
loader$3.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestMipmapNearestFilter;
    warp.magFilter = THREE.NearestMipmapNearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex = warp;
    cubeMap.images = [warp.image, warp.image, warp.image, warp.image, warp.image, warp.image];
    cubeMap.needsUpdate = true;
});
let WarpPortalShader = {
    uniforms: uniforms,
    vertexShader: {
        uniforms: glsl$3 `
        varying vec3 vRay;
        varying vec3 portalNormal;
        //varying vec3 cameraLocal;
        `,
        postTransform: glsl$3 `
        // vec3 cameraLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vec3 cameraLocal = (inverse(modelViewMatrix) * vec4(0.0,0.0,0.0, 1.0)).xyz;
        vRay = position - cameraLocal;
        if (vRay.z < 0.0) {
            vRay.z = -vRay.z;
            vRay.x = -vRay.x;
        }
        //vRay = vec3(mvPosition.x, mvPosition.y, mvPosition.z);
        portalNormal = normalize(-1. * vRay);
        //float portal_dist = length(cameraLocal);
        float portal_dist = length(vRay);
        vRay.z *= 1.1 / (1. + pow(portal_dist, 0.5)); // Change FOV by squashing local Z direction
      `
    },
    fragmentShader: {
        functions: glsl$4,
        uniforms: glsl$3 `
        uniform samplerCube portalCubeMap;
        uniform float portalRadius;
        uniform vec3 portalRingColor;
        uniform float portalTime;
        uniform int invertWarpColor;

        uniform vec2 texInvSize;

        varying vec3 vRay;
        varying vec3 portalNormal;
       // varying vec3 cameraLocal;

        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 

        #define RING_WIDTH 0.1
        #define RING_HARD_OUTER 0.01
        #define RING_HARD_INNER 0.08
        `,
        replaceMap: glsl$3 `
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));

          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          col = mapTexelToLinear( col );
         
          if (invertWarpColor > 0) {
              col = vec4(col.b, col.g, col.r, col.a);
          }

          /// portal shader effect
          vec2 portal_coord = vUv * 2.0 - 1.0;
          float portal_noise = snoise(vec3(portal_coord * 1., portalTime)) * 0.5 + 0.5;
        
          // Polar distance
          float portal_dist = length(portal_coord);
          portal_dist += portal_noise * 0.2;
        
          float maskOuter = 1.0 - smoothstep(portalRadius - RING_HARD_OUTER, portalRadius, portal_dist);
          float maskInner = 1.0 - smoothstep(portalRadius - RING_WIDTH, portalRadius - RING_WIDTH + RING_HARD_INNER, portal_dist);
          float portal_distortion = smoothstep(portalRadius - 0.2, portalRadius + 0.2, portal_dist);
          
          vec3 portalnormal = normalize(portalNormal);
          vec3 forwardPortal = vec3(0.0, 0.0, -1.0);

          float portal_directView = smoothstep(0.0, 0.8, dot(portalnormal, forwardPortal));
          vec3 portal_tangentOutward = normalize(vec3(portal_coord, 0.0));
          vec3 portal_ray = mix(vRay, portal_tangentOutward, portal_distortion);

          vec4 myCubeTexel = textureCube(portalCubeMap, portal_ray);

        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x - texInvSize.s, portal_ray.yz))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x - texInvSize.s, portal_ray.yz))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x, portal_ray.y - texInvSize.t, portal_ray.z))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x, portal_ray.y - texInvSize.t, portal_ray.z))) / 8.0;        

          myCubeTexel = mapTexelToLinear( myCubeTexel );

        //   vec4 posCol = vec4(smoothstep(-6.0, 6.0, cameraLocal), 1.0); //normalize((cameraLocal / 6.0));
        //   myCubeTexel = posCol; // vec4(posCol.x, posCol.y, posCol.y, 1.0);
          vec3 centerLayer = myCubeTexel.rgb * maskInner;
          vec3 ringLayer = portalRingColor * (1. - maskInner);
          vec3 portal_composite = centerLayer + ringLayer;
        
          //gl_FragColor 
          vec4 portalCol = vec4(portal_composite, (maskOuter - maskInner) + maskInner * portal_directView);
        
          // blend the two
          portalCol.rgb *= portalCol.a; //premultiply source 
          col.rgb *= (1.0 - portalCol.a);
          col.rgb += portalCol.rgb;

          diffuseColor *= col;
        `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map && mat.map.repeat ? mat.map.repeat : new THREE.Vector2(1, 1) };
        material.uniforms.texOffset = { value: mat.map && mat.map.offset ? mat.map.offset : new THREE.Vector2(0, 0) };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map && mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
        material.uniforms.warpTex.value = warpTex;
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 };
        material.uniforms.portalTime = { value: 0 };
        material.uniforms.invertWarpColor = { value: mat.userData.invertWarpColor ? mat.userData.invertWarpColor : false };
        material.uniforms.portalRingColor = { value: mat.userData.ringColor ? mat.userData.ringColor : new THREE.Color("red") };
        material.uniforms.portalCubeMap = { value: mat.userData.cubeMap ? mat.userData.cubeMap : cubeMap };
        material.uniforms.portalRadius = { value: mat.userData.radius ? mat.userData.radius : 0.5 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.portalTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.warpTex.value = warpTex;
        material.uniforms.portalCubeMap.value = material.userData.cubeMap ? material.userData.cubeMap : cubeMap;
        material.uniforms.portalRadius.value = material.userData.radius ? material.userData.radius : 0.5;
        if (material.userData.cubeMap && Array.isArray(material.userData.cubeMap.images) && material.userData.cubeMap.images[0]) {
            let height = material.userData.cubeMap.images[0].height;
            let width = material.userData.cubeMap.images[0].width;
            material.uniforms.texInvSize.value = new THREE.Vector2(width, height);
        }
    }
};

/**
 * Various simple shaders
 */
function mapMaterials(object3D, fn) {
    let mesh = object3D;
    if (!mesh.material)
        return;
    if (Array.isArray(mesh.material)) {
        return mesh.material.map(fn);
    }
    else {
        return fn(mesh.material);
    }
}
// TODO:  key a record of new materials, indexed by the original
// material UUID, so we can just return it if replace is called on
// the same material more than once
function replaceMaterial(oldMaterial, shader, userData) {
    //   if (oldMaterial.type != "MeshStandardMaterial") {
    //       console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.")
    //       return;
    //   }
    //const material = oldMaterial.clone();
    var CustomMaterial;
    try {
        CustomMaterial = defaultMaterialModifier.extend(oldMaterial.type, {
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });
    }
    catch (e) {
        return null;
    }
    // create a new material, initializing the base part with the old material here
    let material = new CustomMaterial();
    switch (oldMaterial.type) {
        case "MeshStandardMaterial":
            THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial);
            break;
        case "MeshPhongMaterial":
            THREE.MeshPhongMaterial.prototype.copy.call(material, oldMaterial);
            break;
        case "MeshBasicMaterial":
            THREE.MeshBasicMaterial.prototype.copy.call(material, oldMaterial);
            break;
    }
    material.userData = userData;
    material.needsUpdate = true;
    shader.init(material);
    return material;
}
function updateWithShader(shaderDef, el, target, userData = {}) {
    // mesh would contain the object that is, or contains, the meshes
    var mesh = el.object3DMap.mesh;
    if (!mesh) {
        // if no mesh, we'll search through all of the children.  This would
        // happen if we dropped the component on a glb in spoke
        mesh = el.object3D;
    }
    let materials = [];
    let traverse = (object) => {
        let mesh = object;
        if (mesh.material) {
            mapMaterials(mesh, (material) => {
                if (!target || material.name === target) {
                    let newM = replaceMaterial(material, shaderDef, userData);
                    if (newM) {
                        mesh.material = newM;
                        materials.push(newM);
                    }
                }
            });
        }
        const children = object.children;
        for (let i = 0; i < children.length; i++) {
            traverse(children[i]);
        }
    };
    traverse(mesh);
    return materials;
}
new THREE.Vector3();
new THREE.Vector3(0, 0, 1);
const once$2 = {
    once: true
};
AFRAME.registerComponent('shader', {
    materials: null,
    shaderDef: null,
    schema: {
        name: { type: 'string', default: "noise" },
        target: { type: 'string', default: "" } // if nothing passed, just create some noise
    },
    init: function () {
        var shaderDef;
        switch (this.data.name) {
            case "noise":
                shaderDef = NoiseShader;
                break;
            case "warp":
                shaderDef = WarpShader;
                break;
            case "warp-portal":
                shaderDef = WarpPortalShader;
                break;
            case "liquidmarble":
                shaderDef = LiquidMarbleShader;
                break;
            case "bleepyblocks":
                shaderDef = BleepyBlocksShader;
                break;
            case "galaxy":
                shaderDef = GalaxyShader;
                break;
            case "lacetunnel":
                shaderDef = LaceTunnelShader;
                break;
            case "firetunnel":
                shaderDef = FireTunnelShader;
                break;
            case "mist":
                shaderDef = MistShader;
                break;
            case "marble1":
                shaderDef = Marble1Shader;
                break;
            default:
                // an unknown name was passed in
                console.warn("unknown name '" + this.data.name + "' passed to shader component");
                shaderDef = NotFoundShader;
                break;
        }
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        let updateMaterials = () => {
            let target = this.data.target;
            if (target.length == 0) {
                target = null;
            }
            this.materials = updateWithShader(shaderDef, this.el, target);
        };
        let initializer = () => {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    updateMaterials();
                    this.el.removeEventListener("model-loaded", fn);
                };
                this.el.addEventListener("media-loaded", fn);
            }
            else {
                updateMaterials();
            }
        };
        root && root.addEventListener("model-loaded", initializer, once$2);
        this.shaderDef = shaderDef;
    },
    tick: function (time) {
        if (this.shaderDef == null || this.materials == null) {
            return;
        }
        let shaderDef = this.shaderDef;
        this.materials.map((mat) => { shaderDef.updateUniforms(time, mat); });
        // switch (this.data.name) {
        //     case "noise":
        //         break;
        //     case "bleepyblocks":
        //         break;
        //     default:
        //         break;
        // }
        // if (this.shader) {
        //     console.log("fragment shader:", this.material.fragmentShader)
        //     this.shader = null
        // }
    },
});

var goldcolor = "https://lcagmac.github.io/core-components/2aeb00b64ae9568f.jpg";

var goldDisplacement = "https://lcagmac.github.io/core-components/50a1b6d338cb246e.jpg";

var goldgloss = "https://lcagmac.github.io/core-components/aeab2091e4a53e9d.png";

var goldnorm = "https://lcagmac.github.io/core-components/0ce46c422f945a96.jpg";

var goldao = "https://lcagmac.github.io/core-components/6a3e8b4332d47ce2.jpg";

let SIZE = 1024;
let TARGETWIDTH = SIZE;
let TARGETHEIGHT = SIZE;

window.APP.writeWayPointTextures = function(names) {
    if ( !Array.isArray( names ) ) {
        names = [ names ];
    }

    for ( let k = 0; k < names.length; k++ ) {
        let waypoints = document.getElementsByClassName(names[k]);
        for (let i = 0; i < waypoints.length; i++) {
            if (waypoints[i].components.waypoint) {
                let cubecam = null;
                // 
                // for (let j = 0; j < waypoints[i].object3D.children.length; j++) {
                //     if (waypoints[i].object3D.children[j] instanceof CubeCameraWriter) {
                //         console.log("found waypoint with cubeCamera '" + names[k] + "'")
                //         cubecam = waypoints[i].object3D.children[j]
                //         break;
                //     }
                // }
                // if (!cubecam) {
                    console.log("didn't find waypoint with cubeCamera '" + names[k] + "', creating one.");                    // create a cube map camera and render the view!
                    if (THREE.REVISION < 125) {   
                        cubecam = new CubeCameraWriter(0.1, 1000, SIZE);
                    } else {
                        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( SIZE, { encoding: THREE.sRGBEncoding, generateMipmaps: true } );
                        cubecam = new CubeCameraWriter(1, 100000, cubeRenderTarget);
                    }
        
                    cubecam.position.y = 1.6;
                    cubecam.needsUpdate = true;
                    waypoints[i].object3D.add(cubecam);
                    cubecam.update(window.APP.scene.renderer, 
                                   window.APP.scene.object3D);
                // }                

                cubecam.saveCubeMapSides(names[k]);
                waypoints[i].object3D.remove(cubecam);
                break;
            }
        }
    }
};

class CubeCameraWriter extends THREE.CubeCamera {

    constructor(...args) {
        super(...args);

        this.canvas = document.createElement('canvas');
        this.canvas.width = TARGETWIDTH;
        this.canvas.height = TARGETHEIGHT;
        this.ctx = this.canvas.getContext('2d');
        // this.renderTarget.texture.generateMipmaps = true;
        // this.renderTarget.texture.minFilter = THREE.LinearMipMapLinearFilter;
        // this.renderTarget.texture.magFilter = THREE.LinearFilter;

        // this.update = function( renderer, scene ) {

        //     let [ cameraPX, cameraNX, cameraPY, cameraNY, cameraPZ, cameraNZ ] = this.children;

    	// 	if ( this.parent === null ) this.updateMatrixWorld();

    	// 	if ( this.parent === null ) this.updateMatrixWorld();

    	// 	var currentRenderTarget = renderer.getRenderTarget();

    	// 	var renderTarget = this.renderTarget;
    	// 	//var generateMipmaps = renderTarget.texture.generateMipmaps;

    	// 	//renderTarget.texture.generateMipmaps = false;

    	// 	renderer.setRenderTarget( renderTarget, 0 );
    	// 	renderer.render( scene, cameraPX );

    	// 	renderer.setRenderTarget( renderTarget, 1 );
    	// 	renderer.render( scene, cameraNX );

    	// 	renderer.setRenderTarget( renderTarget, 2 );
    	// 	renderer.render( scene, cameraPY );

    	// 	renderer.setRenderTarget( renderTarget, 3 );
    	// 	renderer.render( scene, cameraNY );

    	// 	renderer.setRenderTarget( renderTarget, 4 );
    	// 	renderer.render( scene, cameraPZ );

    	// 	//renderTarget.texture.generateMipmaps = generateMipmaps;

    	// 	renderer.setRenderTarget( renderTarget, 5 );
    	// 	renderer.render( scene, cameraNZ );

    	// 	renderer.setRenderTarget( currentRenderTarget );
        // };
	}

    saveCubeMapSides(slug) {
        for (let i = 0; i < 6; i++) {
            this.capture(slug, i);
        }
    }
    
    capture (slug, side) {
        //var isVREnabled = window.APP.scene.renderer.xr.enabled;
        window.APP.scene.renderer;
        // Disable VR.
        //renderer.xr.enabled = false;
        this.renderCapture(side);
        // Trigger file download.
        this.saveCapture(slug, side);
        // Restore VR.
        //renderer.xr.enabled = isVREnabled;
     }

    renderCapture (cubeSide) {
        var imageData;
        var pixels3 = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);
        var renderer = window.APP.scene.renderer;

        renderer.readRenderTargetPixels(this.renderTarget, 0, 0, TARGETWIDTH,TARGETHEIGHT, pixels3, cubeSide);

        //pixels3 = this.flipPixelsVertically(pixels3, TARGETWIDTH, TARGETHEIGHT);
        var pixels4 = pixels3;  //this.convert3to4(pixels3, TARGETWIDTH, TARGETHEIGHT);
        imageData = new ImageData(new Uint8ClampedArray(pixels4), TARGETWIDTH, TARGETHEIGHT);

        // Copy pixels into canvas.

        // could use drawImage instead, to scale, if we want
        this.ctx.putImageData(imageData, 0, 0);
    }

    flipPixelsVertically (pixels, width, height) {
        var flippedPixels = pixels.slice(0);
        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            flippedPixels[x * 3 + y * width * 3] = pixels[x * 3 + (height - y - 1) * width * 3];
            flippedPixels[x * 3 + 1 + y * width * 3] = pixels[x * 3 + 1 + (height - y - 1) * width * 3];
            flippedPixels[x * 3 + 2 + y * width * 3] = pixels[x * 3 + 2 + (height - y - 1) * width * 3];
          }
        }
        return flippedPixels;
    }

    convert3to4 (pixels, width, height) {
        var newPixels = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);

        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            newPixels[x * 4 + y * width * 4] = pixels[x * 3 + y * width * 3];
            newPixels[x * 4 + 1 + y * width * 4] = pixels[x * 3 + 1 + y * width * 3];
            newPixels[x * 4 + 2 + y * width * 4] = pixels[x * 3 + 2 + y * width * 3];
            newPixels[x * 4 + 3 + y * width * 4] = 255;
          }
        }
        return newPixels;
    }


    sides = [
        "Right", "Left", "Top", "Bottom", "Front", "Back"
    ]

    saveCapture (slug, side) {
        this.canvas.toBlob( (blob) => {
            var fileName = slug + '-' + this.sides[side] + '.png';
            var linkEl = document.createElement('a');
            var url = URL.createObjectURL(blob);
            linkEl.href = url;
            linkEl.setAttribute('download', fileName);
            linkEl.innerHTML = 'downloading...';
            linkEl.style.display = 'none';
            document.body.appendChild(linkEl);
            setTimeout(function () {
                linkEl.click();
                document.body.removeChild(linkEl);
            }, 1);
        }, 'image/png');
    }
}

/**
 * Description
 * ===========
 * Bidirectional see-through portal. Two portals are paired by color.
 *
 * Usage
 * =======
 * Add two instances of `portal.glb` to the Spoke scene.
 * The name of each instance should look like "some-descriptive-label__color"
 * Any valid THREE.Color argument is a valid color value.
 * See here for example color names https://www.w3schools.com/cssref/css_colors.asp
 *
 * For example, to make a pair of connected blue portals,
 * you could name them "portal-to__blue" and "portal-from__blue"
 */

const worldPos = new THREE.Vector3();
const worldCameraPos = new THREE.Vector3();
const worldDir = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();
const mat4 = new THREE.Matrix4();

// load and setup all the bits of the textures for the door
const loader$2 = new THREE.TextureLoader();
const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.0, 
    //emissiveIntensity: 1
});
const doormaterialY = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0, 
    //emissiveIntensity: 1
});

loader$2.load(goldcolor, (color) => {
    doorMaterial.map = color;
    color.repeat.set(1,25);
    color.wrapS = THREE.RepeatWrapping;
    color.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});
loader$2.load(goldcolor, (color) => {
    //color = color.clone()
    doormaterialY.map = color;
    color.repeat.set(1,1);
    color.wrapS = THREE.ClampToEdgeWrapping;
    color.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$2.load(goldDisplacement, (disp) => {
    doorMaterial.bumpMap = disp;
    disp.repeat.set(1,25);
    disp.wrapS = THREE.RepeatWrapping;
    disp.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$2.load(goldDisplacement, (disp) => {
    //disp = disp.clone()
    doormaterialY.bumpMap = disp;
    disp.repeat.set(1,1);
    disp.wrapS = THREE.ClampToEdgeWrapping;
    disp.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$2.load(goldgloss, (gloss) => {
    doorMaterial.roughness = gloss;
    gloss.repeat.set(1,25);
    gloss.wrapS = THREE.RepeatWrapping;
    gloss.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$2.load(goldgloss, (gloss) => {
    //gloss = gloss.clone()
    doormaterialY.roughness = gloss;
    gloss.repeat.set(1,1);
    gloss.wrapS = THREE.ClampToEdgeWrapping;
    gloss.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});
         
loader$2.load(goldao, (ao) => {
    doorMaterial.aoMap = ao;
    ao.repeat.set(1,25);
    ao.wrapS = THREE.RepeatWrapping;
    ao.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});
         
loader$2.load(goldao, (ao) => {
    // ao = ao.clone()
    doormaterialY.aoMap = ao;
    ao.repeat.set(1,1);
    ao.wrapS = THREE.ClampToEdgeWrapping;
    ao.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$2.load(goldnorm, (norm) => {
    doorMaterial.normalMap = norm;
    norm.repeat.set(1,25);
    norm.wrapS = THREE.RepeatWrapping;
    norm.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$2.load(goldnorm, (norm) => {
    // norm = norm.clone()
    doormaterialY.normalMap = norm;
    norm.repeat.set(1,1);
    norm.wrapS = THREE.ClampToEdgeWrapping;
    norm.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

// // map all materials via a callback.  Taken from hubs materials-utils
// function mapMaterials(object3D, fn) {
//     let mesh = object3D 
//     if (!mesh.material) return;
  
//     if (Array.isArray(mesh.material)) {
//       return mesh.material.map(fn);
//     } else {
//       return fn(mesh.material);
//     }
// }
  
const once$1 = {
    once : true
};

AFRAME.registerSystem('portal', {
  dependencies: ['fader-plus'],
  init: function () {
    this.teleporting = false;
    this.characterController = this.el.systems['hubs-systems'].characterController;
    this.fader = this.el.systems['fader-plus'];
    // this.roomData = null
    this.waitForFetch = this.waitForFetch.bind(this);

    // if the user is logged in, we want to retrieve their userData from the top level server
    // if (window.APP.store.state.credentials && window.APP.store.state.credentials.token && !window.APP.userData) {
    //     this.fetchRoomData()
    // }
  },
//   fetchRoomData: async function () {
//     var params = {token: window.APP.store.state.credentials.token,
//                   room_id: window.APP.hubChannel.hubId}

//     const options = {};
//     options.headers = new Headers();
//     options.headers.set("Authorization", `Bearer ${params}`);
//     options.headers.set("Content-Type", "application/json");
//     await fetch("https://realitymedia.digital/userData", options)
//         .then(response => response.json())
//         .then(data => {
//           console.log('Success:', data);
//           this.roomData = data;
//     })
//     this.roomData.textures = []
//   },
  getRoomURL: async function (number) {
      let hub_id = await this.getRoomHubId(number);

      let url = window.SSO.userInfo.rooms.length > number ? "https://xr.realitymedia.digital/" + hub_id : null;
      return url
  },
  getRoomHubId: async function (number) {
    this.waitForFetch();
    return window.SSO.userInfo.rooms[number]
  },
  getCubeMap: async function (number, waypoint) {
      this.waitForFetch();

      if (!waypoint || waypoint.length == 0) {
          waypoint = "start";
      }
      let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
          return "https://resources.realitymedia.digital/data/roomPanos/" + number.toString() + "/" + waypoint + "-" + el + ".png"
      });
      return urls
      //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  getCubeMapByName: async function (name, waypoint) {
    if (!waypoint || waypoint.length == 0) {
        waypoint = "start";
    }
    let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
        return "https://resources.realitymedia.digital/data/roomPanos/" + name + "/" + waypoint + "-" + el + ".png"
    });
    return urls
    //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  waitForFetch: function () {
     if (window.SSO.userInfo) return
     setTimeout(this.waitForFetch, 100); // try again in 100 milliseconds
  },
  teleportTo: async function (object) {
    this.teleporting = true;
    await this.fader.fadeOut();
    // Scale screws up the waypoint logic, so just send position and orientation
    object.getWorldQuaternion(worldQuat);
    object.getWorldDirection(worldDir);
    object.getWorldPosition(worldPos);
    worldPos.add(worldDir.multiplyScalar(3)); // Teleport in front of the portal to avoid infinite loop
    mat4.makeRotationFromQuaternion(worldQuat);
    mat4.setPosition(worldPos);
    // Using the characterController ensures we don't stray from the navmesh
    this.characterController.travelByWaypoint(mat4, true, false);
    await this.fader.fadeIn();
    this.teleporting = false;
  },
});

AFRAME.registerComponent('portal', {
    schema: {
        portalType: { default: "" },
        portalTarget: { default: "" },
        secondaryTarget: { default: "" },
        color: { type: 'color', default: null },
        materialTarget: { type: 'string', default: null },
        drawDoor: { type: 'boolean', default: false },
        text: { type: 'string', default: null},
        textPosition: { type: 'vec3' },
        textSize: { type: 'vec2' },
        textScale: { type: 'number', default: 1 }
    },

    init: function () {
        // TESTING
        //this.data.drawDoor = true
        // this.data.mainText = "Portal to the Abyss"
        // this.data.secondaryText = "To visit the Abyss, go through the door!"

        // A-Frame is supposed to do this by default but doesn't seem to?
        this.system = window.APP.scene.systems.portal; 

        this.updatePortal = this.updatePortal.bind(this);

        if (this.data.portalType.length > 0 ) {
            this.setPortalInfo(this.data.portalType, this.data.portalTarget, this.data.color);
        } else {
            this.portalType = 0;
        }

        if (this.portalType == 0) {
            // parse the name to get portal type, target, and color
            this.parseNodeName();
        }
        
        this.portalTitle = null;

        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.initialize();
        }, once$1);
    },

    initialize: async function () {
        // this.material = new THREE.ShaderMaterial({
        //   transparent: true,
        //   side: THREE.DoubleSide,
        //   uniforms: {
        //     cubeMap: { value: new THREE.Texture() },
        //     time: { value: 0 },
        //     radius: { value: 0 },
        //     ringColor: { value: this.color },
        //   },
        //   vertexShader,
        //   fragmentShader: `
        //     ${snoise}
        //     ${fragmentShader}
        //   `,
        // })

        // Assume that the object has a plane geometry
        //const mesh = this.el.getOrCreateObject3D('mesh')
        //mesh.material = this.material

        this.materials = null;
        this.radius = 0.2;
        this.cubeMap = new THREE.CubeTexture();

        // get the other before continuing
        this.other = await this.getOther();

        this.el.setAttribute('animation__portal', {
            property: 'components.portal.radius',
            dur: 700,
            easing: 'easeInOutCubic',
        });
        
        // this.el.addEventListener('animationbegin', () => (this.el.object3D.visible = true))
        // this.el.addEventListener('animationcomplete__portal', () => (this.el.object3D.visible = !this.isClosed()))

        // going to want to try and make the object this portal is on clickable
        // this.el.setAttribute('is-remote-hover-target','')
        // this.el.setAttribute('tags', {singleActionButton: true})
        //this.el.setAttribute('class', "interactable")
        // orward the 'interact' events to our portal movement 
        //this.followPortal = this.followPortal.bind(this)
        //this.el.object3D.addEventListener('interact', this.followPortal)

        if ( this.el.components["media-loader"] || this.el.components["media-image"] ) {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    this.setupPortal();
                    if (this.data.drawDoor) {
                        this.setupDoor();
                    }
                    this.el.removeEventListener('model-loaded', fn);
                 };
                this.el.addEventListener("media-loaded", fn);
            } else {
                this.setupPortal();
                if (this.data.drawDoor) {
                    this.setupDoor();
                }
            }
        } else {
            this.setupPortal();
            if (this.data.drawDoor) {
                this.setupDoor();
            }
        }
    },

    updatePortal: async function () {
        // no-op for portals that use pre-rendered cube maps
        if (this.portalType == 2 || this.portalType == 3) { 
            //this.el.sceneEl.addEventListener('model-loaded', () => {
                showRegionForObject(this.el);
                this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
                // this.cubeCamera.renderTarget.texture.generateMipmaps = true
                // this.cubeCamera.renderTarget.texture.needsUpdate = true
                hiderRegionForObject(this.el);
            //}, once)
        }
    },

    setupPortal: async function () {
        // get rid of interactivity
        if (this.el.classList.contains("interactable")) {
            this.el.classList.remove("interactable");
        }
        this.el.removeAttribute("is-remote-hover-target");
        
        let target = this.data.materialTarget;
        if (target && target.length == 0) {target=null;}
    
        this.materials = updateWithShader(WarpPortalShader, this.el, target, {
            radius: this.radius,
            ringColor: this.color,
            cubeMap: this.cubeMap,
            invertWarpColor: this.portalType == 1 ? 1 : 0
        });

        if (this.portalType == 1) {
            this.system.getCubeMap(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                new Promise((resolve, reject) =>
                  new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture;
                }).catch(e => console.error(e));    
            });
        } else if (this.portalType == 4) {
            this.system.getCubeMapByName(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                new Promise((resolve, reject) =>
                    new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture;
                }).catch(e => console.error(e));    
            });
        } else if (this.portalType == 2 || this.portalType == 3) { 
            if (THREE.REVISION < 125) {   
                this.cubeCamera = new CubeCameraWriter(0.1, 1000, 1024);
            } else {
                const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( 1024, { encoding: THREE.sRGBEncoding, generateMipmaps: true } );
                this.cubeCamera = new CubeCameraWriter(1, 100000, cubeRenderTarget);
            }

            //this.cubeCamera.rotateY(Math.PI) // Face forwards
            if (this.portalType == 2) {
                this.el.object3D.add(this.cubeCamera);
                // this.other.components.portal.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture 
                //this.other.components.portal.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                this.other.components.portal.cubeMap = this.cubeCamera.renderTarget.texture;
            } else {
                let waypoint = document.getElementsByClassName(this.portalTarget);
                if (waypoint.length > 0) {
                    waypoint = waypoint.item(0);
                    this.cubeCamera.position.y = 1.6;
                    this.cubeCamera.needsUpdate = true;
                    waypoint.object3D.add(this.cubeCamera);
                    // this.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                    this.cubeMap = this.cubeCamera.renderTarget.texture;
                }
            }
            this.updatePortal();
            this.el.sceneEl.addEventListener('updatePortals', this.updatePortal);
            this.el.sceneEl.addEventListener('model-loaded', this.updatePortal);
        }

        let rot = new THREE.Quaternion();
        let scaleW = new THREE.Vector3();
        let pos = new THREE.Vector3();
        this.el.object3D.matrixWorld.decompose(pos, rot, scaleW);
        let scaleM = this.el.object3DMap["mesh"].scale;

        // let scaleX = scaleM.x * scaleI.x
        // let scaleY = scaleM.y * scaleI.y
        // let scaleZ = scaleM.z * scaleI.z

        // this.portalWidth = scaleX / 2
        // this.portalHeight = scaleY / 2

        // offset to center of portal assuming walking on ground
        // this.Yoffset = -(this.el.object3D.position.y - 1.6)
        this.Yoffset = -((scaleW.y * scaleM.y)/2 - 1.6);
        
        this.close();
        this.el.setAttribute('proximity-events', { radius: 4, Yoffset: this.Yoffset });
        this.el.addEventListener('proximityenter', () => this.open());
        this.el.addEventListener('proximityleave', () => this.close());

        this.el.setObject3D.matrixAutoUpdate = true;
    
        if (this.data.text && this.data.text.length > 0) {
            var titleScriptData = {
                width: this.data.textSize.x,
                height: this.data.textSize.y,
                message: this.data.text
            };
            const portalTitle = vueComponents["PortalTitle"];
            // const portalSubtitle = htmlComponents["PortalSubtitle"]

            this.portalTitle = await portalTitle(titleScriptData);
            // this.portalSubtitle = portalSubtitle(subtitleScriptData)

            this.el.setObject3D('portalTitle', this.portalTitle.webLayer3D);
            let size = this.portalTitle.getSize();
            let titleScaleX = (scaleW.x) / this.data.textScale;
            let titleScaleY = (scaleW.y) / this.data.textScale;
            let titleScaleZ = (scaleW.z) / this.data.textScale;

            this.portalTitle.webLayer3D.scale.x /= titleScaleX;
            this.portalTitle.webLayer3D.scale.y /= titleScaleY;
            this.portalTitle.webLayer3D.scale.z /= titleScaleZ;

            this.portalTitle.webLayer3D.position.x = 
                    this.data.textPosition.x / (scaleW.x);
            this.portalTitle.webLayer3D.position.y = 
                    (0.5 * scaleM.y) +
                    (this.data.drawDoor ? 0.105 : 0) / (scaleW.y) +
                    ((size.height * this.data.textScale) /2) / (scaleW.y) + 
                    this.data.textPosition.y / (scaleW.y);
            this.portalTitle.webLayer3D.position.z = 
                    this.data.textPosition.z / (scaleW.z);
            // this.el.setObject3D('portalSubtitle', this.portalSubtitle.webLayer3D)
            // this.portalSubtitle.webLayer3D.position.x = 1
            this.portalTitle.webLayer3D.matrixAutoUpdate = true;
            // this.portalSubtitle.webLayer3D.matrixAutoUpdate = true
        }
        // this.materials.map((mat) => {
        //     mat.userData.radius = this.radius
        //     mat.userData.ringColor = this.color
        //     mat.userData.cubeMap = this.cubeMap
        // })
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('updatePortals', this.updatePortal);
        this.el.sceneEl.removeEventListener('model-loaded', this.updatePortal);

        if (this.portalTitle) {
            this.el.removeObject3D("portalTitle");

            this.portalTitle.destroy();
            this.portalTitle = null;
        }
        if (this.cubeMap) {
            this.cubeMap.dispose();
            this.cubeMap = null;
        } 
    },

        //   replaceMaterial: function (newMaterial) {
//     let target = this.data.materialTarget
//     if (target && target.length == 0) {target=null}
    
//     let traverse = (object) => {
//       let mesh = object
//       if (mesh.material) {
//           mapMaterials(mesh, (material) => {         
//               if (!target || material.name === target) {
//                   mesh.material = newMaterial
//               }
//           })
//       }
//       const children = object.children;
//       for (let i = 0; i < children.length; i++) {
//           traverse(children[i]);
//       }
//     }

//     let replaceMaterials = () => {
//         // mesh would contain the object that is, or contains, the meshes
//         var mesh = this.el.object3DMap.mesh
//         if (!mesh) {
//             // if no mesh, we'll search through all of the children.  This would
//             // happen if we dropped the component on a glb in spoke
//             mesh = this.el.object3D
//         }
//         traverse(mesh);
//        // this.el.removeEventListener("model-loaded", initializer);
//     }

//     // let root = findAncestorWithComponent(this.el, "gltf-model-plus")
//     // let initializer = () =>{
//       if (this.el.components["media-loader"]) {
//           this.el.addEventListener("media-loaded", replaceMaterials)
//       } else {
//           replaceMaterials()
//       }
//     // };
//     //replaceMaterials()
//     // root.addEventListener("model-loaded", initializer);
//   },

//   followPortal: function() {
//     if (this.portalType == 1) {
//         console.log("set window.location.href to " + this.other)
//         window.location.href = this.other
//       } else if (this.portalType == 2) {
//         this.system.teleportTo(this.other.object3D)
//       }
//   },

    setupDoor: function() {
        // attached to an image in spoke.  This is the only way we allow buidling a 
        // door around it
        let scaleM = this.el.object3DMap["mesh"].scale;
        let rot = new THREE.Quaternion();
        let scaleW = new THREE.Vector3();
        let pos = new THREE.Vector3();
        this.el.object3D.matrixWorld.decompose(pos, rot, scaleW);

        var width = scaleW.x * scaleM.x;
        var height = scaleW.y * scaleM.y;
        var depth = scaleW.z * scaleM.z;
        
        // let scaleI = this.el.object3D.scale
        // var width = scaleM.x * scaleI.x
        // var height = scaleM.y * scaleI.y
        // var depth = 1.0; //  scaleM.z * scaleI.z
        const environmentMapComponent = this.el.sceneEl.components["environment-map"];

        // let above = new THREE.Mesh(
        //     new THREE.SphereGeometry(1, 50, 50),
        //     doormaterialY 
        // );
        // if (environmentMapComponent) {
        //     environmentMapComponent.applyEnvironmentMap(above);
        // }
        // above.position.set(0, 2.5, 0)
        // this.el.object3D.add(above)

        let left = new THREE.Mesh(
            // new THREE.BoxGeometry(0.1/width,2/height,0.1/depth,2,5,2),
            new THREE.BoxGeometry(0.1/width,1,0.099/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(left);
        }
        left.position.set(-0.51, 0, 0);
        this.el.object3D.add(left);

        let right = new THREE.Mesh(
            new THREE.BoxGeometry(0.1/width,1,0.099/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(right);
        }
        right.position.set(0.51, 0, 0);
        this.el.object3D.add(right);

        let top = new THREE.Mesh(
            new THREE.BoxGeometry(1 + 0.3/width,0.1/height,0.1/depth,2,5,2),
            [doormaterialY,doormaterialY,doorMaterial,doorMaterial,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(top);
        }
        top.position.set(0.0, 0.505, 0);
        this.el.object3D.add(top);

        // if (width > 0 && height > 0) {
        //     const {width: wsize, height: hsize} = this.script.getSize()
        //     var scale = Math.min(width / wsize, height / hsize)
        //     this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
        // }
    },

    tick: function (time) {
        //this.material.uniforms.time.value = time / 1000
        if (!this.materials) { return }

        if (this.portalTitle) {
            this.portalTitle.tick(time);
            // this.portalSubtitle.tick(time)
        }

        this.materials.map((mat) => {
            mat.userData.radius = this.radius;
            mat.userData.cubeMap = this.cubeMap;
            WarpPortalShader.updateUniforms(time, mat);
        });

        if (this.other && !this.system.teleporting) {
        //   this.el.object3D.getWorldPosition(worldPos)
        //   this.el.sceneEl.camera.getWorldPosition(worldCameraPos)
        //   worldCameraPos.y -= this.Yoffset
        //   const dist = worldCameraPos.distanceTo(worldPos)
          this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
          this.el.object3D.worldToLocal(worldCameraPos);

          // in local portal coordinates, the width and height are 1
          if (Math.abs(worldCameraPos.x) > 0.5 || Math.abs(worldCameraPos.y) > 0.5) {
            return;
          }
          const dist = Math.abs(worldCameraPos.z);

          // window.APP.utils.changeToHub
          if ((this.portalType == 1 || this.portalType == 4) && dist < 0.25) {
              if (!this.locationhref) {
                this.locationhref = this.other;
                if (!APP.store.state.preferences.fastRoomSwitching) {
                    console.log("set window.location.href to " + this.other);
                    window.location.href = this.other;
                } else {
                    let wayPoint = this.data.secondaryTarget;
                    document.querySelector("#environment-scene");
                    let goToWayPoint = function() {
                        if (wayPoint && wayPoint.length > 0) {
                            console.log("FAST ROOM SWITCH INCLUDES waypoint: setting hash to " + wayPoint);
                            window.location.hash = wayPoint;
                        }
                    };
                    console.log("FAST ROOM SWITCH. going to " + this.hub_id);
                    if (this.hubId === APP.hub.hub_id) {
                        console.log("Same Room");
                        goToWayPoint();
                    } else {
                        window.changeHub(this.hub_id).then(() => {
                            // environmentScene.addEventListener("model-loaded", () => {
                            //     console.log("Environment scene has loaded");
                                goToWayPoint();
                            // })
                        });
                    }
                }
            }
          } else if (this.portalType == 2 && dist < 0.25) {
            this.system.teleportTo(this.other.object3D);
          } else if (this.portalType == 3) {
              if (dist < 0.25) {
                if (!this.locationhref) {
                  console.log("set window.location.hash to " + this.other);
                  this.locationhref = this.other;
                  window.location.hash = this.other;
                }
              } else {
                  // if we set locationhref, we teleported.  when it
                  // finally happens, and we move outside the range of the portal,
                  // we will clear the flag
                  this.locationhref = null;
              }
          }
        }
      },

    getOther: function () {
        return new Promise((resolve) => {
            if (this.portalType == 0) resolve(null);
            if (this.portalType  == 1) {
                // first wait for the hub_id
                this.system.getRoomHubId(this.portalTarget).then(hub_id => {
                    this.hub_id = hub_id;
            
                    // the target is another room, resolve with the URL to the room
                    this.system.getRoomURL(this.portalTarget).then(url => { 
                        if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                            resolve(url + "#" + this.data.secondaryTarget);
                        } else {
                            resolve(url); 
                        }
                    });
                });
            }
            if (this.portalType == 3) {
                resolve ("#" + this.portalTarget);
            }
            if (this.portalType == 4) {
                let url = window.location.origin + "/" + this.portalTarget;
                this.hub_id = this.portalTarget;
                if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                    resolve(url + "#" + this.data.secondaryTarget);
                } else {
                    resolve(url); 
                }
            }

            // now find the portal within the room.  The portals should come in pairs with the same portalTarget
            const portals = Array.from(document.querySelectorAll(`[portal]`));
            const other = portals.find((el) => el.components.portal.portalType == this.portalType &&
                          el.components.portal.portalTarget === this.portalTarget && 
                          el !== this.el);
            if (other !== undefined) {
                // Case 1: The other portal already exists
                resolve(other);
                other.emit('pair', { other: this.el }); // Let the other know that we're ready
            } else {
                // Case 2: We couldn't find the other portal, wait for it to signal that it's ready
                this.el.addEventListener('pair', (event) => { 
                    resolve(event.detail.other);
                }, { once: true });
            }
        })
    },

    parseNodeName: function () {
        const nodeName = this.el.parentEl.parentEl.className;

        // nodes should be named anything at the beginning with either 
        // - "room_name_color"
        // - "portal_N_color" 
        // at the very end. Numbered portals should come in pairs.
        const params = nodeName.match(/([A-Za-z]*)_([A-Za-z0-9]*)_([A-Za-z0-9]*)$/);
        
        // if pattern matches, we will have length of 4, first match is the portal type,
        // second is the name or number, and last is the color
        if (!params || params.length < 4) {
            console.warn("portal node name not formed correctly: ", nodeName);
            this.portalType = 0;
            this.portalTarget = null;
            this.color = "red"; // default so the portal has a color to use
            return;
        } 
        this.setPortalInfo(params[1], params[2], params[3]);
    },

    setPortalInfo: function(portalType, portalTarget, color) {
        if (portalType === "room") {
            this.portalType = 1;
            this.portalTarget = parseInt(portalTarget);
        } else if (portalType === "portal") {
            this.portalType = 2;
            this.portalTarget = portalTarget;
        } else if (portalType === "waypoint") {
            this.portalType = 3;
            this.portalTarget = portalTarget;
        } else if (portalType === "roomName") {
            this.portalType = 4;
            this.portalTarget = portalTarget;
        } else {    
            this.portalType = 0;
            this.portalTarget = null;
        } 
        this.color = new THREE.Color(color);
    },

    setRadius(val) {
        this.el.setAttribute('animation__portal', {
        //   from: this.material.uniforms.radius.value,
            from: this.radius,
            to: val,
        });
    },
    open() {
        this.setRadius(1);
    },
    close() {
        this.setRadius(0.2);
    },
    isClosed() {
        // return this.material.uniforms.radius.value === 0
        return this.radius === 0.2
    },
});

var ballfx = "https://lcagmac.github.io/core-components/e1702ea21afb4a86.png";

const glsl$2 = `
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;
uniform float ballTime;
uniform float selected;

mat4 ballinverse(mat4 m) {
  float
      a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
      a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
      a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
      a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  return mat4(
      a11 * b11 - a12 * b10 + a13 * b09,
      a02 * b10 - a01 * b11 - a03 * b09,
      a31 * b05 - a32 * b04 + a33 * b03,
      a22 * b04 - a21 * b05 - a23 * b03,
      a12 * b08 - a10 * b11 - a13 * b07,
      a00 * b11 - a02 * b08 + a03 * b07,
      a32 * b02 - a30 * b05 - a33 * b01,
      a20 * b05 - a22 * b02 + a23 * b01,
      a10 * b10 - a11 * b08 + a13 * b06,
      a01 * b08 - a00 * b10 - a03 * b06,
      a30 * b04 - a31 * b02 + a33 * b00,
      a21 * b02 - a20 * b04 - a23 * b00,
      a11 * b07 - a10 * b09 - a12 * b06,
      a00 * b09 - a01 * b07 + a02 * b06,
      a31 * b01 - a30 * b03 - a32 * b00,
      a20 * b03 - a21 * b01 + a22 * b00) / det;
}


mat4 balltranspose(in mat4 m) {
  vec4 i0 = m[0];
  vec4 i1 = m[1];
  vec4 i2 = m[2];
  vec4 i3 = m[3];

  return mat4(
    vec4(i0.x, i1.x, i2.x, i3.x),
    vec4(i0.y, i1.y, i2.y, i3.y),
    vec4(i0.z, i1.z, i2.z, i3.z),
    vec4(i0.w, i1.w, i2.w, i3.w)
  );
}

void main()
{
  ballvUv = uv;

  ballvPosition = position;

  vec3 offset = vec3(
    sin(position.x * 50.0 + ballTime),
    sin(position.y * 10.0 + ballTime * 2.0),
    cos(position.z * 40.0 + ballTime)
  ) * 0.003;

   ballvPosition *= 1.0 + selected * 0.2;

   ballvNormal = normalize(ballinverse(balltranspose(modelMatrix)) * vec4(normalize(normal), 1.0)).xyz;
   ballvWorldPos = (modelMatrix * vec4(ballvPosition, 1.0)).xyz;

   vec4 ballvPosition = modelViewMatrix * vec4(ballvPosition + offset, 1.0);

  gl_Position = projectionMatrix * ballvPosition;
}
`;

const glsl$1 = `
uniform sampler2D panotex;
uniform sampler2D texfx;
uniform float ballTime;
uniform float selected;
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;

uniform float opacity;

void main( void ) {
   vec2 uv = ballvUv;
  //uv.y =  1.0 - uv.y;

   vec3 eye = normalize(cameraPosition - ballvWorldPos);
   float fresnel = abs(dot(eye, ballvNormal));
   float shift = pow((1.0 - fresnel), 4.0) * 0.05;

  vec3 col = vec3(
    texture2D(panotex, uv - shift).r,
    texture2D(panotex, uv).g,
    texture2D(panotex, uv + shift).b
  );

   col = mix(col * 0.7, vec3(1.0), 0.7 - fresnel);

   col += selected * 0.3;

   float t = ballTime * 0.4 + ballvPosition.x + ballvPosition.z;
   uv = vec2(ballvUv.x + t * 0.2, ballvUv.y + t);
   vec3 fx = texture2D(texfx, uv).rgb * 0.4;

  //vec4 col = vec4(1.0, 1.0, 0.0, 1.0);
  gl_FragColor = vec4(col + fx, opacity);
  //gl_FragColor = vec4(col + fx, 1.0);
}
`;

/**
 * Description
 * ===========
 * 360 image that fills the user's vision when in a close proximity.
 *
 * Usage
 * =======
 * Given a 360 image asset with the following URL in Spoke:
 * https://gt-ael-aq-assets.aelatgt-internal.net/files/12345abc-6789def.jpg
 *
 * The name of the `immersive-360.glb` instance in the scene should be:
 * "some-descriptive-label__12345abc-6789def_jpg" OR "12345abc-6789def_jpg"
 */

const worldCamera = new THREE.Vector3();
const worldSelf = new THREE.Vector3();

const loader$1 = new THREE.TextureLoader();
var ballTex = null;
loader$1.load(ballfx, (ball) => {
    ball.minFilter = THREE.NearestFilter;
    ball.magFilter = THREE.NearestFilter;
    ball.wrapS = THREE.RepeatWrapping;
    ball.wrapT = THREE.RepeatWrapping;
    ballTex = ball;
});

// simple hack to get position of pano media aligned with camera.
// Systems are updated after components, so we do the final alignment
// with the camera after all the components are updated.
AFRAME.registerSystem('immersive-360', {
  init: function () {
    this.updateThis = null;
  },
  updatePosition(component) {
    // TODO:  add this to a queue, and process the queue in tick()
    this.updateThis = component;
  },

  tick: function () {
    // TODO: process the queue, popping everything off the queue when we are done
    if (this.updateThis) {
      ///let cam = document.getElementById("viewing-camera").object3DMap.camera;
      this.updateThis.el.sceneEl.camera.updateMatrices();
      this.updateThis.el.sceneEl.camera.getWorldPosition(worldCamera);
      this.updateThis.el.object3D.worldToLocal(worldCamera);
      this.updateThis.mesh.position.copy(worldCamera);
      this.updateThis.mesh.matrixNeedsUpdate = true;
      this.updateThis.mesh.updateWorldMatrix(true, false);
    }
  },

});
AFRAME.registerComponent('immersive-360', {
  schema: {
    url: { type: 'string', default: null },
    radius: { type: 'number', default: 0.15 },
  },

  init: async function () {
    this.system = window.APP.scene.systems['immersive-360'];

    var url = this.data.url;
    if (!url || url == "") {
        url = this.parseSpokeName();
    }
    
    const extension = url.match(/^.*\.(.*)$/)[1];

    // set up the local content and hook it to the scene
    this.pano = document.createElement('a-entity');
    // media-image will set up the sphere geometry for us
    this.pano.setAttribute('media-image', {
      projection: '360-equirectangular',
      alphaMode: 'opaque',
      src: url,
      version: 1,
      batch: false,
      contentType: `image/${extension}`,
      alphaCutoff: 0,
    });
   // this.pano.object3D.position.y = 1.6
    this.el.appendChild(this.pano);

    // but we need to wait for this to happen
    this.mesh = await this.getMesh();
    this.mesh.matrixAutoUpdate = true;
    this.mesh.updateWorldMatrix(true, false);

    var ball = new THREE.Mesh(
        new THREE.SphereBufferGeometry(this.data.radius, 30, 20),
        new THREE.ShaderMaterial({
            uniforms: {
              panotex: {value: this.mesh.material.map},
              texfx: {value: ballTex},
              selected: {value: 0},
              ballTime: {value: 0}
            },
            vertexShader: glsl$2,
            fragmentShader: glsl$1,
            side: THREE.BackSide,
          })
    );
   
    // get the pano oriented properly in the room relative to the way media-image is oriented
    ball.rotation.set(Math.PI, Math.PI, 0);

    ball.userData.floatY = (this.data.radius > 1.5 ? this.data.radius + 0.1 : 1.6);
    ball.userData.selected = 0;
    ball.userData.timeOffset = (Math.random()+0.5) * 10;
    this.ball = ball;
    this.el.setObject3D("ball", ball);

    //this.mesh.geometry.scale(2, 2, 2)
    this.mesh.material.setValues({
      transparent: true,
      depthTest: false,
    });
    this.mesh.visible = false;

    this.near = this.data.radius - 0;
    this.far = this.data.radius + 0.05;

    // Render OVER the scene but UNDER the cursor
    this.mesh.renderOrder = APP.RENDER_ORDER.CURSOR - 0.1;
  },
  remove: function() {
    this.ball.geometry.dispose();
    this.ball.geometry = null;
    this.ball.material.dispose();
    this.ball.material = null;
    this.el.removeObject3D("ball");
    this.ball = null;
  },
  tick: function (time) {
    if (this.mesh && ballTex) {
      let offset = Math.cos((time + this.ball.userData.timeOffset)/1000 * 3 ) * 0.02;
      this.ball.position.y = this.ball.userData.floatY + offset;
      this.ball.matrixNeedsUpdate = true;

      this.ball.material.uniforms.texfx.value = ballTex;
      this.ball.material.uniforms.ballTime.value = time * 0.001 + this.ball.userData.timeOffset;
      // Linearly map camera distance to material opacity
      this.ball.getWorldPosition(worldSelf);
      this.el.sceneEl.camera.getWorldPosition(worldCamera);
      const distance = worldSelf.distanceTo(worldCamera);
      const opacity = 1 - (distance - this.near) / (this.far - this.near);
      if (opacity < 0) {
          // far away
          this.mesh.visible = false;
          this.mesh.material.opacity = 1;
          this.ball.material.opacity = 1;
        } else {
            this.mesh.material.opacity = opacity > 1 ? 1 : opacity;
            this.mesh.visible = true;
            this.ball.material.opacity = this.mesh.material.opacity;
            
            // position the mesh around user until they leave the ball
            // this.el.object3D.worldToLocal(worldCamera)
            // this.mesh.position.copy(worldCamera)
            
            // this.el.object3D.getWorldPosition(worldSelf)
            // worldSelf.y += this.ball.userData.floatY;

            // worldSelf.sub(worldCamera)
            // this.mesh.position.copy(worldSelf)
            this.system.updatePosition(this);
        }
    }
  },
  parseSpokeName: function () {
    // Accepted names: "label__image-hash_ext" OR "image-hash_ext"
    const spokeName = this.el.parentEl.parentEl.className;
    const matches = spokeName.match(/(?:.*__)?(.*)_(.*)/);
    if (!matches || matches.length < 3) { return "" }
    const [, hash, extension]  = matches;
    const url = `https://resources.realitymedia.digital/data/${hash}.${extension}`;
    return url
  },
  getMesh: async function () {
    return new Promise((resolve) => {
      const mesh = this.pano.object3DMap.mesh;
      if (mesh) resolve(mesh);
      this.pano.addEventListener(
        'image-loaded',
        () => {
            console.log("immersive-360 pano loaded: " + this.data.url);
          resolve(this.pano.object3DMap.mesh);
        },
        { once: true }
      );
    })
  },
});

// Parallax Occlusion shaders from
//    http://sunandblackcat.com/tipFullView.php?topicid=28
// No tangent-space transforms logic based on
//   http://mmikkelsen3d.blogspot.sk/2012/02/parallaxpoc-mapping-and-no-tangent.html

// Identity function for glsl-literal highlighting in VS Code
const glsl = String.raw;

const ParallaxShader = {
  // Ordered from fastest to best quality.
  modes: {
    none: 'NO_PARALLAX',
    basic: 'USE_BASIC_PARALLAX',
    steep: 'USE_STEEP_PARALLAX',
    occlusion: 'USE_OCLUSION_PARALLAX', // a.k.a. POM
    relief: 'USE_RELIEF_PARALLAX',
  },

  uniforms: {
    bumpMap: { value: null },
    map: { value: null },
    parallaxScale: { value: null },
    parallaxMinLayers: { value: null },
    parallaxMaxLayers: { value: null },
  },

  vertexShader: glsl`
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      vViewPosition = -mvPosition.xyz;
      vNormal = normalize( normalMatrix * normal );
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: glsl`
    uniform sampler2D bumpMap;
    uniform sampler2D map;

    uniform float parallaxScale;
    uniform float parallaxMinLayers;
    uniform float parallaxMaxLayers;
    uniform float fade; // CUSTOM

    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    #ifdef USE_BASIC_PARALLAX

    vec2 parallaxMap(in vec3 V) {
      float initialHeight = texture2D(bumpMap, vUv).r;

      // No Offset Limitting: messy, floating output at grazing angles.
      //"vec2 texCoordOffset = parallaxScale * V.xy / V.z * initialHeight;",

      // Offset Limiting
      vec2 texCoordOffset = parallaxScale * V.xy * initialHeight;
      return vUv - texCoordOffset;
    }

    #else

    vec2 parallaxMap(in vec3 V) {
      // Determine number of layers from angle between V and N
      float numLayers = mix(parallaxMaxLayers, parallaxMinLayers, abs(dot(vec3(0.0, 0.0, 1.0), V)));

      float layerHeight = 1.0 / numLayers;
      float currentLayerHeight = 0.0;
      // Shift of texture coordinates for each iteration
      vec2 dtex = parallaxScale * V.xy / V.z / numLayers;

      vec2 currentTextureCoords = vUv;

      float heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;

      // while ( heightFromTexture > currentLayerHeight )
      // Infinite loops are not well supported. Do a "large" finite
      // loop, but not too large, as it slows down some compilers.
      for (int i = 0; i < 30; i += 1) {
        if (heightFromTexture <= currentLayerHeight) {
          break;
        }
        currentLayerHeight += layerHeight;
        // Shift texture coordinates along vector V
        currentTextureCoords -= dtex;
        heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;
      }

      #ifdef USE_STEEP_PARALLAX

      return currentTextureCoords;

      #elif defined(USE_RELIEF_PARALLAX)

      vec2 deltaTexCoord = dtex / 2.0;
      float deltaHeight = layerHeight / 2.0;

      // Return to the mid point of previous layer
      currentTextureCoords += deltaTexCoord;
      currentLayerHeight -= deltaHeight;

      // Binary search to increase precision of Steep Parallax Mapping
      const int numSearches = 5;
      for (int i = 0; i < numSearches; i += 1) {
        deltaTexCoord /= 2.0;
        deltaHeight /= 2.0;
        heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;
        // Shift along or against vector V
        if (heightFromTexture > currentLayerHeight) {
          // Below the surface

          currentTextureCoords -= deltaTexCoord;
          currentLayerHeight += deltaHeight;
        } else {
          // above the surface

          currentTextureCoords += deltaTexCoord;
          currentLayerHeight -= deltaHeight;
        }
      }
      return currentTextureCoords;

      #elif defined(USE_OCLUSION_PARALLAX)

      vec2 prevTCoords = currentTextureCoords + dtex;

      // Heights for linear interpolation
      float nextH = heightFromTexture - currentLayerHeight;
      float prevH = texture2D(bumpMap, prevTCoords).r - currentLayerHeight + layerHeight;

      // Proportions for linear interpolation
      float weight = nextH / (nextH - prevH);

      // Interpolation of texture coordinates
      return prevTCoords * weight + currentTextureCoords * (1.0 - weight);

      #else // NO_PARALLAX

      return vUv;

      #endif
    }
    #endif

    vec2 perturbUv(vec3 surfPosition, vec3 surfNormal, vec3 viewPosition) {
      vec2 texDx = dFdx(vUv);
      vec2 texDy = dFdy(vUv);

      vec3 vSigmaX = dFdx(surfPosition);
      vec3 vSigmaY = dFdy(surfPosition);
      vec3 vR1 = cross(vSigmaY, surfNormal);
      vec3 vR2 = cross(surfNormal, vSigmaX);
      float fDet = dot(vSigmaX, vR1);

      vec2 vProjVscr = (1.0 / fDet) * vec2(dot(vR1, viewPosition), dot(vR2, viewPosition));
      vec3 vProjVtex;
      vProjVtex.xy = texDx * vProjVscr.x + texDy * vProjVscr.y;
      vProjVtex.z = dot(surfNormal, viewPosition);

      return parallaxMap(vProjVtex);
    }

    void main() {
      vec2 mapUv = perturbUv(-vViewPosition, normalize(vNormal), normalize(vViewPosition));
      
      // CUSTOM START
      vec4 texel = texture2D(map, mapUv);
      vec3 color = mix(texel.xyz, vec3(0), fade);
      gl_FragColor = vec4(color, 1.0);
      // CUSTOM END
    }

  `,
};

/**
 * Description
 * ===========
 * Create the illusion of depth in a color image from a depth map
 *
 * Usage
 * =====
 * Create a plane in Blender and give it a material (just the default Principled BSDF).
 * Assign color image to "color" channel and depth map to "emissive" channel.
 * You may want to set emissive strength to zero so the preview looks better.
 * Add the "parallax" component from the Hubs extension, configure, and export as .glb
 */

const vec = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1);

AFRAME.registerComponent('parallax', {
  schema: {
    strength: { type: 'number', default: 0.5 },
    cutoffTransition: { type: 'number', default: Math.PI / 8 },
    cutoffAngle: { type: 'number', default: Math.PI / 4 },
  },
  init: function () {
    const mesh = this.el.object3DMap.mesh;
    const { map: colorMap, emissiveMap: depthMap } = mesh.material;
    colorMap.wrapS = colorMap.wrapT = THREE.ClampToEdgeWrapping;
    depthMap.wrapS = depthMap.wrapT = THREE.ClampToEdgeWrapping;
    const { vertexShader, fragmentShader } = ParallaxShader;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { USE_OCLUSION_PARALLAX: true },
      uniforms: {
        map: { value: colorMap },
        bumpMap: { value: depthMap },
        parallaxScale: { value: -1 * this.data.strength },
        parallaxMinLayers: { value: 20 },
        parallaxMaxLayers: { value: 30 },
        fade: { value: 0 },
      },
    });
    mesh.material = this.material;
  },
  tick() {
    if (this.el.sceneEl.camera) {
      this.el.sceneEl.camera.getWorldPosition(vec);
      this.el.object3D.worldToLocal(vec);
      const angle = vec.angleTo(forward);
      const fade = mapLinearClamped(
        angle,
        this.data.cutoffAngle - this.data.cutoffTransition,
        this.data.cutoffAngle + this.data.cutoffTransition,
        0, // In view zone, no fade
        1 // Outside view zone, full fade
      );
      this.material.uniforms.fade.value = fade;
    }
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mapLinear(x, a1, a2, b1, b2) {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1)
}

function mapLinearClamped(x, a1, a2, b1, b2) {
  return clamp(mapLinear(x, a1, a2, b1, b2), b1, b2)
}

var spinnerImage = "https://lcagmac.github.io/core-components/f98b96fe3e06ea20.png";

/**
 * Description
 * ===========
 * create a HTML object by rendering a script that creates and manages it
 *
 */

// load and setup all the bits of the textures for the door
const loader = new THREE.TextureLoader();
const spinnerGeometry = new THREE.PlaneGeometry( 1, 1 );
const spinnerMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.1
});

loader.load(spinnerImage, (color) => {
    spinnerMaterial.map = color;
    spinnerMaterial.needsUpdate = true;
});

// var htmlComponents;
// var scriptPromise;
// if (window.__testingVueApps) {
//     scriptPromise = import(window.__testingVueApps)    
// } else {
//     scriptPromise = import("https://lcagmac.github.io/vue-apps/dist/hubs.js") 
// }
// // scriptPromise = scriptPromise.then(module => {
// //     return module
// // });
/**
 * Modified from https://github.com/mozilla/hubs/blob/master/src/components/fader.js
 * to include adjustable duration and converted from component to system
 */

 AFRAME.registerSystem('html-script', {  
    init() {
        this.systemTick = vueComponents["systemTick"];
        this.initializeEthereal = vueComponents["initializeEthereal"];
        if (!this.systemTick || !this.initializeEthereal) {
            console.error("error in html-script system: htmlComponents has no systemTick and/or initializeEthereal methods");
        } else {
            this.initializeEthereal();
        }
    },
  
    tick(t, dt) {
        this.systemTick(t, dt);
    },
  });
  
const once = {
    once : true
};
  
AFRAME.registerComponent('html-script', {
    schema: {
        // name must follow the pattern "*_componentName"
        name: { type: "string", default: ""},
        width: { type: "number", default: -1},
        height: { type: "number", default: -1},
        parameter1: { type: "string", default: ""},
        parameter2: { type: "string", default: ""},
        parameter3: { type: "string", default: ""},
        parameter4: { type: "string", default: ""},
    },
    init: function () {
        this.script = null;
        this.fullName = this.data.name;

        this.scriptData = {
            width: this.data.width,
            height: this.data.height,
            parameter1: this.data.parameter1,
            parameter2: this.data.parameter2,
            parameter3: this.data.parameter3,
            parameter4: this.data.parameter4
        };

        this.loading = true;
        this.spinnerPlane = new THREE.Mesh( spinnerGeometry, spinnerMaterial );
        this.spinnerPlane.matrixAutoUpdate = true;
        this.spinnerPlane.position.z = 0.05;
        if (!this.fullName || this.fullName.length == 0) {
            this.parseNodeName();
        } else {
            this.componentName = this.fullName;
        }

        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.createScript();
        }, once);

        //this.createScript();
    },

    update: function () {
        if (this.data.name === "" || this.data.name === this.fullName) return

        this.fullName = this.data.name;
        // this.parseNodeName();
        this.componentName = this.fullName;
        
        if (this.script) {
            this.destroyScript();
        }
        this.createScript();
    },

    createScript: function () {
        // each time we load a script component we will possibly create
        // a new networked component.  This is fine, since the networked Id 
        // is based on the full name passed as a parameter, or assigned to the
        // component in Spoke.  It does mean that if we have
        // multiple objects in the scene which have the same name, they will
        // be in sync.  It also means that if you want to drop a component on
        // the scene via a .glb, it must have a valid name parameter inside it.
        // A .glb in spoke will fall back to the spoke name if you use one without
        // a name inside it.
        let loader = () => {
            this.loadScript().then( () => {
                if (!this.script) return

                if (this.script.isNetworked) {
                    // get the parent networked entity, when it's finished initializing.  
                    // When creating this as part of a GLTF load, the 
                    // parent a few steps up will be networked.  We'll only do this
                    // if the HTML script wants to be networked
                    this.netEntity = null;

                    // bind callbacks
                    this.getSharedData = this.getSharedData.bind(this);
                    this.takeOwnership = this.takeOwnership.bind(this);
                    this.setSharedData = this.setSharedData.bind(this);

                    this.script.setNetworkMethods(this.takeOwnership, this.setSharedData);
                }

                // set up the local content and hook it to the scene
                const scriptEl = document.createElement('a-entity');
                this.simpleContainer = scriptEl;
                this.simpleContainer.object3D.matrixAutoUpdate = true;
                this.simpleContainer.setObject3D("weblayer3d", this.script.webLayer3D);

                // lets figure out the scale, but scaling to fill the a 1x1m square, that has also
                // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                // set there.
                // We used to have a fixed size passed back from the entity, but that's too restrictive:
                // const width = this.script.width
                // const height = this.script.height

                // TODO: need to find environment-scene, go down two levels to the group above 
                // the nodes in the scene.  Then accumulate the scales up from this node to
                // that node.  This will account for groups, and nesting.

                var width = 1, height = 1;
                if (this.el.components["media-image"]) {
                    // attached to an image in spoke, so the image mesh is size 1 and is scaled directly
                    let scaleM = this.el.object3DMap["mesh"].scale;
                    let scaleI = this.el.object3D.scale;
                    width = scaleM.x * scaleI.x;
                    height = scaleM.y * scaleI.y;
                    scaleI.x = 1;
                    scaleI.y = 1;
                    scaleI.z = 1;
                    this.el.object3D.matrixNeedsUpdate = true;
                } else {
                    // it's embedded in a simple gltf model;  other models may not work
                    // we assume it's at the top level mesh, and that the model itself is scaled
                    let mesh = this.el.object3DMap["mesh"];
                    if (mesh) {
                        let box = mesh.geometry.boundingBox;
                        width = (box.max.x - box.min.x) * mesh.scale.x;
                        height = (box.max.y - box.min.y) * mesh.scale.y;
                    } else {
                        let meshScale = this.el.object3D.scale;
                        width = meshScale.x;
                        height = meshScale.y;
                        meshScale.x = 1;
                        meshScale.y = 1;
                        meshScale.z = 1;
                        this.el.object3D.matrixNeedsUpdate = true;
                    }
                    // apply the root gltf scale.
                    var parent2 = this.el.parentEl.parentEl.object3D;
                    width *= parent2.scale.x;
                    height *= parent2.scale.y;
                    parent2.scale.x = 1;
                    parent2.scale.y = 1;
                    parent2.scale.z = 1;
                    parent2.matrixNeedsUpdate = true;
                }

                this.actualWidth = width;
                this.actualHeight = height;

                if (width > 0 && height > 0) {
                    const {width: wsize, height: hsize} = this.script.getSize();
                    if (wsize > 0 && hsize > 0) {
                        var scale = Math.min(width / wsize, height / hsize);
                        this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
                    }
                    const spinnerScale = Math.min(width,height) * 0.25;
                    this.spinnerPlane.scale.set(spinnerScale, spinnerScale, 1);
                }

                // there will be one element already, the cube we created in blender
                // and attached this component to, so remove it if it is there.
                // this.el.object3D.children.pop()
                for (const c of this.el.object3D.children) {
                    c.visible = false;
                }

                // make sure "isStatic" is correct;  can't be static if either interactive or networked
                if (this.script.isStatic && (this.script.isInteractive || this.script.isNetworked)) {
                    this.script.isStatic = false;
                }
                            
                // add in our container
                this.el.appendChild(this.simpleContainer);

                this.el.setObject3D("spinner", this.spinnerPlane);

                // TODO:  we are going to have to make sure this works if 
                // the script is ON an interactable (like an image)
                
                if (this.script.isInteractive) {
                    if (this.el.classList.contains("interactable")) ;

                    // make the html object clickable
                    this.simpleContainer.setAttribute('is-remote-hover-target','');
                    this.simpleContainer.setAttribute('tags', {
                        singleActionButton: true,
                        inspectable: true,
                        isStatic: true,
                        togglesHoveredActionSet: true
                    });
                    this.simpleContainer.setAttribute('class', "interactable");

                    // forward the 'interact' events to our object 
                    this.clicked = this.clicked.bind(this);
                    this.simpleContainer.object3D.addEventListener('interact', this.clicked);

                    if (this.script.isDraggable) {
                        // we aren't going to really deal with this till we have a use case, but
                        // we can set it up for now
                        this.simpleContainer.setAttribute('tags', {
                            singleActionButton: true, 
                            isHoldable: true,  
                            holdableButton: true,
                            inspectable: true,
                            isStatic: true,
                            togglesHoveredActionSet: true
                        });
        
                        this.simpleContainer.object3D.addEventListener('holdable-button-down', (evt) => {
                            this.script.dragStart(evt);
                        });
                        this.simpleContainer.object3D.addEventListener('holdable-button-up', (evt) => {
                            this.script.dragEnd(evt);
                        });
                    }

                    //this.raycaster = new THREE.Raycaster()
                    this.hoverRayL = new THREE.Ray();
                    this.hoverRayR = new THREE.Ray();
                } else {
                    // no interactivity, please
                    if (this.el.classList.contains("interactable")) {
                        this.el.classList.remove("interactable");
                    }
                    this.el.removeAttribute("is-remote-hover-target");
                }

                // TODO: this SHOULD work but make sure it works if the el we are on
                // is networked, such as when attached to an image

                if (this.el.hasAttribute("networked")) {
                    this.el.removeAttribute("networked");
                }

                if (this.script.isNetworked) {
                    // This function finds an existing copy of the Networked Entity (if we are not the
                    // first client in the room it will exist in other clients and be created by NAF)
                    // or create an entity if we are first.
                    this.setupNetworkedEntity = function (networkedEl) {
                        var persistent = true;
                        var netId;
                        if (networkedEl) {
                            // We will be part of a Networked GLTF if the GLTF was dropped on the scene
                            // or pinned and loaded when we enter the room.  Use the networked parents
                            // networkId plus a disambiguating bit of text to create a unique Id.
                            netId = NAF.utils.getNetworkId(networkedEl) + "-html-script";

                            // if we need to create an entity, use the same persistence as our
                            // network entity (true if pinned, false if not)
                            persistent = entity.components.networked.data.persistent;
                        } else {
                            // this only happens if this component is on a scene file, since the
                            // elements on the scene aren't networked.  So let's assume each entity in the
                            // scene will have a unique name.  Adding a bit of text so we can find it
                            // in the DOM when debugging.
                            netId = this.fullName.replaceAll("_","-") + "-html-script";
                        }

                        // check if the networked entity we create for this component already exists. 
                        // otherwise, create it
                        // - NOTE: it is created on the scene, not as a child of this entity, because
                        //   NAF creates remote entities in the scene.
                        var entity;
                        if (NAF.entities.hasEntity(netId)) {
                            entity = NAF.entities.getEntity(netId);
                        } else {
                            entity = document.createElement('a-entity');

                            // store the method to retrieve the script data on this entity
                            entity.getSharedData = this.getSharedData;

                            // the "networked" component should have persistent=true, the template and 
                            // networkId set, owner set to "scene" (so that it doesn't update the rest of
                            // the world with it's initial data, and should NOT set creator (the system will do that)
                            entity.setAttribute('networked', {
                                template: "#script-data-media",
                                persistent: persistent,
                                owner: "scene",  // so that our initial value doesn't overwrite others
                                networkId: netId
                            });
                            this.el.sceneEl.appendChild(entity);
                        }

                        // save a pointer to the networked entity and then wait for it to be fully
                        // initialized before getting a pointer to the actual networked component in it
                        this.netEntity = entity;
                        NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                            this.stateSync = networkedEl.components["script-data"];

                            // if this is the first networked entity, it's sharedData will default to the  
                            // string "{}", and we should initialize it with the initial data from the script
                            if (this.stateSync.sharedData.length == 2) {
                                networkedEl.components["networked"];
                                // if (networked.data.creator == NAF.clientId) {
                                //     this.stateSync.initSharedData(this.script.getSharedData())
                                // }
                            }
                        });
                    };
                    this.setupNetworkedEntity = this.setupNetworkedEntity.bind(this);

                    this.setupNetworked = function () {
                        NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
                            this.setupNetworkedEntity(networkedEl);
                        }).catch(() => {
                            this.setupNetworkedEntity();
                        });
                    };
                    this.setupNetworked = this.setupNetworked.bind(this);

                    // This method handles the different startup cases:
                    // - if the GLTF was dropped on the scene, NAF will be connected and we can 
                    //   immediately initialize
                    // - if the GLTF is in the room scene or pinned, it will likely be created
                    //   before NAF is started and connected, so we wait for an event that is
                    //   fired when Hubs has started NAF
                    if (NAF.connection && NAF.connection.isConnected()) {
                        this.setupNetworked();
                    } else {
                        this.el.sceneEl.addEventListener('didConnectToNetworkedScene', this.setupNetworked);
                    }
                }
            }).catch(e => {
                console.error("loadScript failed for script " + this.data.name + ": " + e);
            });
        };
        // if attached to a node with a media-loader component, this means we attached this component
        // to a media object in Spoke.  We should wait till the object is fully loaded.  
        // Otherwise, it was attached to something inside a GLTF (probably in blender)
        if (this.el.components["media-loader"]) {
            this.el.addEventListener("media-loaded", () => {
                loader();
            },
            { once: true });
        } else {
            loader();
        }
    },

    play: function () {
        if (this.script) {
            this.script.play();
        }
    },

    pause: function () {
        if (this.script) {
            this.script.pause();
        }
    },

    // handle "interact" events for clickable entities
    clicked: function(evt) {
        console.log("clicked on html: ", evt);
        this.script.clicked(evt); 
    },
  
    // methods that will be passed to the html object so they can update networked data
    takeOwnership: function() {
        if (this.stateSync) {
            return this.stateSync.takeOwnership()
        } else {
            return true;  // sure, go ahead and change it for now
        }
    },
    
    setSharedData: function(dataObject) {
        if (this.stateSync) {
            return this.stateSync.setSharedData(dataObject)
        }
        return true
    },

    // this is called from below, to get the initial data from the script
    getSharedData: function() {
        if (this.script) {
            return this.script.getSharedData()
        }
        // shouldn't happen
        console.warn("script-data component called parent element but there is no script yet?");
        return "{}"
    },

    // per frame stuff
    tick: function (time) {
        if (!this.script) return

        if (this.loading) {
            this.spinnerPlane.rotation.z += 0.03;
        } else {
            if (this.script.isInteractive) {
                // more or less copied from "hoverable-visuals.js" in hubs
                const toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;
                var passthruInteractor = [];

                let interactorOne, interactorTwo;
                const interaction = this.el.sceneEl.systems.interaction;
                if (!interaction.ready) return; //DOMContentReady workaround
                
                let hoverEl = this.simpleContainer;
                if (interaction.state.leftHand.hovered === hoverEl && !interaction.state.leftHand.held) {
                interactorOne = interaction.options.leftHand.entity.object3D;
                }
                if (
                interaction.state.leftRemote.hovered === hoverEl &&
                !interaction.state.leftRemote.held &&
                !toggling.leftToggledOff
                ) {
                interactorOne = interaction.options.leftRemote.entity.object3D;
                }
                if (interactorOne) {
                    let pos = interactorOne.position;
                    let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate();
                    pos.addScaledVector(dir, -0.1);
                    this.hoverRayL.set(pos, dir);

                    passthruInteractor.push(this.hoverRayL);
                }
                if (
                interaction.state.rightRemote.hovered === hoverEl &&
                !interaction.state.rightRemote.held &&
                !toggling.rightToggledOff
                ) {
                interactorTwo = interaction.options.rightRemote.entity.object3D;
                }
                if (interaction.state.rightHand.hovered === hoverEl && !interaction.state.rightHand.held) {
                    interactorTwo = interaction.options.rightHand.entity.object3D;
                }
                if (interactorTwo) {
                    let pos = interactorTwo.position;
                    let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate();
                    pos.addScaledVector(dir, -0.1);
                    this.hoverRayR.set(pos, dir);
                    passthruInteractor.push(this.hoverRayR);
                }

                this.script.webLayer3D.interactionRays = passthruInteractor;
            }

            if (this.script.isNetworked) {
                // if we haven't finished setting up the networked entity don't do anything.
                if (!this.netEntity || !this.stateSync) { return }

                // if the state has changed in the networked data, update our html object
                if (this.stateSync.changed) {
                    this.stateSync.changed = false;
                    this.script.updateSharedData(this.stateSync.dataObject);
                }
            }

            this.script.tick(time);
        }
    },
  
    // TODO:  should only be called if there is no parameter specifying the
    // html script name.
    parseNodeName: function () {
        if (this.fullName === "") {

            // TODO:  switch this to find environment-root and go down to 
            // the node at the room of scene (one above the various nodes).  
            // then go up from here till we get to a node that has that node
            // as it's parent
            this.fullName = this.el.parentEl.parentEl.className;
        } 

        // nodes should be named anything at the beginning with 
        //  "componentName"
        // at the very end.  This will fetch the component from the resource
        // componentName
        const params = this.fullName.match(/_([A-Za-z0-9]*)$/);

        // if pattern matches, we will have length of 3, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("html-script componentName not formatted correctly: ", this.fullName);
            this.componentName = null;
        } else {
            this.componentName = params[1];
        }
    },

    loadScript: async function () {
        // if (scriptPromise) {
        //     try {
        //         htmlComponents = await scriptPromise;
        //     } catch(e) {
        //         console.error(e);
        //         return
        //     }
        //     scriptPromise = null
        // }
        var initScript = vueComponents[this.componentName];
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + this.componentName);
            this.script = null;
            return;
        }

        try {
            this.script = new initScript(this.scriptData);
        } catch (e) {
            console.error("error creating script for " + this.componentName, e);
            this.script = null;
        }
        if (this.script){
            this.script.needsUpdate = true;
            // this.script.webLayer3D.refresh(true)
            // this.script.webLayer3D.update(true)

            this.script.waitForReady().then(() => {
                const {width: wsize, height: hsize} = this.script.getSize();
                if (wsize > 0 && hsize > 0) {
                    var scale = Math.min(this.actualWidth / wsize, this.actualHeight / hsize);
                    this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
                }

                // when a script finishes getting ready, tell the 
                // portals to update themselves
                this.el.sceneEl.emit('updatePortals'); 
                this.loading = false;
                this.el.removeObject3D("spinner");
            });
		} else {
            console.warn("'html-script' component failed to initialize script for " + this.componentName);
        }
    },

    remove: function () {
        this.destroyScript();
    },

    destroyScript: function () {
        if (this.script.isInteractive) {
            this.simpleContainer.object3D.removeEventListener('interact', this.clicked);
        }

        window.APP.scene.removeEventListener('didConnectToNetworkedScene', this.setupNetworked);

        this.el.removeChild(this.simpleContainer);
        this.simpleContainer.removeObject3D("weblayer3d");
        this.simpleContainer = null;

        if (this.script.isNetworked && this.netEntity.parentNode) {
            this.netEntity.parentNode.removeChild(this.netEntity);
        }
        this.script.destroy();
        this.script = null;
    }
});

//
// Component for our networked state.  This component does nothing except all us to 
// change the state when appropriate. We could set this up to signal the component above when
// something has changed, instead of having the component above poll each frame.
//

AFRAME.registerComponent('script-data', {
    schema: {
        scriptdata: {type: "string", default: "{}"},
    },
    init: function () {
        this.takeOwnership = this.takeOwnership.bind(this);
        this.setSharedData = this.setSharedData.bind(this);

        this.dataObject = this.el.getSharedData();
        try {
            this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject));
            this.el.setAttribute("script-data", "scriptdata", this.sharedData);
        } catch(e) {
            console.error("Couldn't encode initial script data object: ", e, this.dataObject);
            this.sharedData = "{}";
            this.dataObject = {};
        }
        this.changed = false;
    },

    update() {
        this.changed = !(this.sharedData === this.data.scriptdata);
        if (this.changed) {
            try {
                this.dataObject = JSON.parse(decodeURIComponent(this.data.scriptdata));

                // do these after the JSON parse to make sure it has succeeded
                this.sharedData = this.data.scriptdata;
                this.changed = true;
            } catch(e) {
                console.error("couldn't parse JSON received in script-sync: ", e);
                this.sharedData = "{}";
                this.dataObject = {};
            }
        }
    },

    // it is likely that applyPersistentSync only needs to be called for persistent
    // networked entities, so we _probably_ don't need to do this.  But if there is no
    // persistent data saved from the network for this entity, this command does nothing.
    play() {
        if (this.el.components.networked) {
            // not sure if this is really needed, but can't hurt
            if (APP.utils) { // temporary till we ship new client
                APP.utils.applyPersistentSync(this.el.components.networked.data.networkId);
            }
        }
    },

    takeOwnership() {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        return true;
    },

    // initSharedData(dataObject) {
    //     try {
    //         var htmlString = encodeURIComponent(JSON.stringify(dataObject))
    //         this.sharedData = htmlString
    //         this.dataObject = dataObject
    //         return true
    //     } catch (e) {
    //         console.error("can't stringify the object passed to script-sync")
    //         return false
    //     }
    // },

    // The key part in these methods (which are called from the component above) is to
    // check if we are allowed to change the networked object.  If we own it (isMine() is true)
    // we can change it.  If we don't own in, we can try to become the owner with
    // takeOwnership(). If this succeeds, we can set the data.  
    //
    // NOTE: takeOwnership ATTEMPTS to become the owner, by assuming it can become the
    // owner and notifying the networked copies.  If two or more entities try to become
    // owner,  only one (the last one to try) becomes the owner.  Any state updates done
    // by the "failed attempted owners" will not be distributed to the other clients,
    // and will be overwritten (eventually) by updates from the other clients.   By not
    // attempting to guarantee ownership, this call is fast and synchronous.  Any 
    // methods for guaranteeing ownership change would take a non-trivial amount of time
    // because of network latencies.

    setSharedData(dataObject) {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        try {
            var htmlString = encodeURIComponent(JSON.stringify(dataObject));
            this.sharedData = htmlString;
            this.dataObject = dataObject;
            this.el.setAttribute("script-data", "scriptdata", htmlString);
            return true
        } catch (e) {
            console.error("can't stringify the object passed to script-sync");
            return false
        }
    }
});

// Add our template for our networked object to the a-frame assets object,
// and a schema to the NAF.schemas.  Both must be there to have custom components work

const assets = document.querySelector("a-assets");

assets.insertAdjacentHTML(
    'beforeend',
    `
    <template id="script-data-media">
      <a-entity
        script-data
      ></a-entity>
    </template>
  `
  );

NAF.schemas.add({
  	template: "#script-data-media",
    components: [
    // {
    //     component: "script-data",
    //     property: "rotation",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    // {
    //     component: "script-data",
    //     property: "scale",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    {
      	component: "script-data",
      	property: "scriptdata"
    }],
      nonAuthorizedComponents: [
      {
            component: "script-data",
            property: "scriptdata"
      }
    ],

  });

/**
 * control a video from a component you stand on.  Implements a radius from the center of
 * the object it's attached to, in meters
 */
AFRAME.registerComponent('video-control-pad', {
    mediaVideo: {},
    schema: {
        target: { type: 'string', default: "" },
        radius: { type: 'number', default: 1 }
    },
    init: function () {
        if (this.data.target.length == 0) {
            console.warn("video-control-pad must have 'target' set");
            return;
        }
        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", () => {
            this.initialize();
        });
    },
    initialize: function () {
        var _a;
        let v = (_a = this.el.sceneEl) === null || _a === void 0 ? void 0 : _a.object3D.getObjectByName(this.data.target);
        if (v == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' does not exist");
            return;
        }
        if (v.el.components["media-loader"] || v.el.components["media-video"]) {
            if (v.el.components["media-loader"]) {
                let fn = () => {
                    this.setupVideoPad(v);
                    v.el.removeEventListener('model-loaded', fn);
                };
                v.el.addEventListener("media-loaded", fn);
            }
            else {
                this.setupVideoPad(v);
            }
        }
        else {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element");
        }
    },
    setupVideoPad: function (video) {
        this.mediaVideo = video.el.components["media-video"];
        if (this.mediaVideo == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element");
        }
        // //@ts-ignore
        // if (!this.mediaVideo.video.paused) {
        //     //@ts-ignore
        //     this.mediaVideo.togglePlaying()
        // }
        this.el.setAttribute('proximity-events', { radius: this.data.radius, Yoffset: 1.6 });
        this.el.addEventListener('proximityenter', () => this.enterRegion());
        this.el.addEventListener('proximityleave', () => this.leaveRegion());
    },
    enterRegion: function () {
        if (this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying();
        }
    },
    leaveRegion: function () {
        if (!this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying();
        }
    },
});

new THREE.Vector3();
new THREE.Quaternion();

const IDENTITY = new THREE.Matrix4().identity();
function setMatrixWorld(object3D, m) {
  if (!object3D.matrixIsModified) {
    object3D.applyMatrix(IDENTITY); // hack around our matrix optimizations
  }
  object3D.matrixWorld.copy(m);
  if (object3D.parent) {
    object3D.parent.updateMatrices();
    object3D.matrix = object3D.matrix.getInverse(object3D.parent.matrixWorld).multiply(object3D.matrixWorld);
  } else {
    object3D.matrix.copy(object3D.matrixWorld);
  }
  object3D.matrix.decompose(object3D.position, object3D.quaternion, object3D.scale);
  object3D.childrenNeedMatrixWorldUpdate = true;
}

((function() {
  const mat4 = new THREE.Matrix4();
  const end = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  const start = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  const interpolated = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  return function(startMat4, endMat4, progress, outMat4) {
    start.quaternion.setFromRotationMatrix(mat4.extractRotation(startMat4));
    end.quaternion.setFromRotationMatrix(mat4.extractRotation(endMat4));
    THREE.Quaternion.slerp(start.quaternion, end.quaternion, interpolated.quaternion, progress);
    interpolated.position.lerpVectors(
      start.position.setFromMatrixColumn(startMat4, 3),
      end.position.setFromMatrixColumn(endMat4, 3),
      progress
    );
    interpolated.scale.lerpVectors(
      start.scale.setFromMatrixScale(startMat4),
      end.scale.setFromMatrixScale(endMat4),
      progress
    );
    return outMat4.compose(
      interpolated.position,
      interpolated.quaternion,
      interpolated.scale
    );
  };
}))();

((function() {
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  return function(objA, objB) {
    objA.updateMatrices();
    objB.updateMatrices();
    posA.setFromMatrixColumn(objA.matrixWorld, 3);
    posB.setFromMatrixColumn(objB.matrixWorld, 3);
    return posA.distanceToSquared(posB);
  };
}))();

const affixToWorldUp = (function() {
  const inRotationMat4 = new THREE.Matrix4();
  const inForward = new THREE.Vector3();
  const outForward = new THREE.Vector3();
  const outSide = new THREE.Vector3();
  const worldUp = new THREE.Vector3(); // Could be called "outUp"
  const v = new THREE.Vector3();
  const inMat4Copy = new THREE.Matrix4();
  return function affixToWorldUp(inMat4, outMat4) {
    inRotationMat4.identity().extractRotation(inMat4Copy.copy(inMat4));
    inForward.setFromMatrixColumn(inRotationMat4, 2).multiplyScalar(-1);
    outForward
      .copy(inForward)
      .sub(v.copy(inForward).projectOnVector(worldUp.set(0, 1, 0)))
      .normalize();
    outSide.crossVectors(outForward, worldUp);
    outMat4.makeBasis(outSide, worldUp, outForward.multiplyScalar(-1));
    outMat4.scale(v.setFromMatrixScale(inMat4Copy));
    outMat4.setPosition(v.setFromMatrixColumn(inMat4Copy, 3));
    return outMat4;
  };
})();

((function() {
  const upAffixedCameraTransform = new THREE.Matrix4();
  const upAffixedWaypointTransform = new THREE.Matrix4();
  const detachFromWorldUp = new THREE.Matrix4();
  return function calculateCameraTransformForWaypoint(cameraTransform, waypointTransform, outMat4) {
    affixToWorldUp(cameraTransform, upAffixedCameraTransform);
    detachFromWorldUp.getInverse(upAffixedCameraTransform).multiply(cameraTransform);
    affixToWorldUp(waypointTransform, upAffixedWaypointTransform);
    outMat4.copy(upAffixedWaypointTransform).multiply(detachFromWorldUp);
  };
}))();

((function() {
  const inMat4Copy = new THREE.Matrix4();
  const startRotation = new THREE.Matrix4();
  const endRotation = new THREE.Matrix4();
  const v = new THREE.Vector3();
  return function rotateInPlaceAroundWorldUp(inMat4, theta, outMat4) {
    inMat4Copy.copy(inMat4);
    return outMat4
      .copy(endRotation.makeRotationY(theta).multiply(startRotation.extractRotation(inMat4Copy)))
      .scale(v.setFromMatrixScale(inMat4Copy))
      .setPosition(v.setFromMatrixPosition(inMat4Copy));
  };
}))();

((function() {
  const inverseParentWorld = new THREE.Matrix4();
  const childRelativeToParent = new THREE.Matrix4();
  const childInverse = new THREE.Matrix4();
  const newParentMatrix = new THREE.Matrix4();
  // transform the parent such that its child matches the target
  return function childMatch(parent, child, target) {
    parent.updateMatrices();
    inverseParentWorld.getInverse(parent.matrixWorld);
    child.updateMatrices();
    childRelativeToParent.multiplyMatrices(inverseParentWorld, child.matrixWorld);
    childInverse.getInverse(childRelativeToParent);
    newParentMatrix.multiplyMatrices(target, childInverse);
    setMatrixWorld(parent, newParentMatrix);
  };
}))();

const calculatePlaneMatrix = (function () {
    const planeMatrix = new THREE.Matrix4();
    const planeUp = new THREE.Vector3();
    const planeForward = new THREE.Vector3();
    const planeRight = new THREE.Vector3();
    const planePosition = new THREE.Vector3();
    const camPosition = new THREE.Vector3();

    return function calculatePlaneMatrix(camera, button) {
        camera.updateMatrices();
        camPosition.setFromMatrixPosition(camera.matrixWorld);
        button.updateMatrices();
        planePosition.setFromMatrixPosition(button.matrixWorld);
        planeForward.subVectors(planePosition, camPosition);
        planeForward.y = 0;
        planeForward.normalize();
        planeUp.set(0, 1, 0);
        planeRight.crossVectors(planeForward, planeUp);
        planeMatrix.makeBasis(planeRight, planeUp, planeForward.multiplyScalar(-1));
        planeMatrix.elements[12] = planePosition.x;
        planeMatrix.elements[13] = planePosition.y;
        planeMatrix.elements[14] = planePosition.z;
        return planeMatrix;
    };
})();

const planeForLeftCursor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
    new THREE.MeshBasicMaterial({
        visible: true,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    })
);
const planeForRightCursor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
    new THREE.MeshBasicMaterial({
        visible: true,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    })
);

class HandleInteraction {
    constructor(el) {
        this.el = el;

        this.isDragging = false;
        this.dragInteractor = null;
        this.planeRotation = new THREE.Matrix4();
        this.planeUp = new THREE.Vector3();
        this.planeRight = new THREE.Vector3();
        this.intersections = [];
        this.initialIntersectionPoint = new THREE.Vector3();
        this.intersectionPoint = new THREE.Vector3();
        this.delta = {
            x: 0,
            y: 0
        };
        this.objectMatrix = new THREE.Matrix4();
        this.dragVector = new THREE.Vector3();

        this.camPosition = new THREE.Vector3();
        this.objectPosition = new THREE.Vector3();
        this.objectToCam = new THREE.Vector3();
    }

    getInteractors(obj) {
        let toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;

        // more or less copied from "hoverable-visuals.js" in hubs
        const interaction = this.el.sceneEl.systems.interaction;
        var passthruInteractor = [];

        let interactorOne, interactorTwo;
        if (!interaction.ready) return; //DOMContentReady workaround

        // TODO:  may want to look to see the hovered objects are children of obj??
        let hoverEl = obj;
        if (interaction.state.leftHand.hovered === hoverEl && !interaction.state.leftHand.held) {
            interactorOne = {
                cursor: interaction.options.leftHand.entity.object3D,
                controller: interaction.leftCursorControllerEl.components["cursor-controller"]
            };
        }
        if (
            interaction.state.leftRemote.hovered === hoverEl &&
            !interaction.state.leftRemote.held &&
            !toggling.leftToggledOff
        ) {
            interactorOne = {
                cursor: interaction.options.leftRemote.entity.object3D,
                controller: interaction.leftCursorControllerEl.components["cursor-controller"]
            };

        }
        if (interactorOne) {
            passthruInteractor.push(interactorOne);
        }
        if (
            interaction.state.rightRemote.hovered === hoverEl &&
            !interaction.state.rightRemote.held &&
            !toggling.rightToggledOff
        ) {
            interactorTwo = {
                cursor: interaction.options.rightRemote.entity.object3D,
                controller: interaction.rightCursorControllerEl.components["cursor-controller"]
            };
        }
        if (interaction.state.rightHand.hovered === hoverEl && !interaction.state.rightHand.held) {
            interactorTwo = {
                cursor: interaction.options.rightHand.entity.object3D,
                controller: interaction.rightCursorControllerEl.components["cursor-controller"]
            };
        }
        if (interactorTwo) {
            passthruInteractor.push(interactorTwo);
        }
        return passthruInteractor
    }

    getRefs() {
        if (!this.didGetObjectReferences) {
            this.didGetObjectReferences = true;
            const interaction = this.el.sceneEl.systems.interaction;

            // this.leftEventer = document.getElementById("left-cursor").object3D;
            // this.leftCursorController = document.getElementById("left-cursor-controller");
            // this.leftRaycaster = this.leftCursorController.components["cursor-controller"].raycaster;
            // this.rightCursorController = document.getElementById("right-cursor-controller");
            // this.rightRaycaster = this.rightCursorController.components["cursor-controller"].raycaster;
            this.leftEventer = interaction.options.leftRemote.entity.object3D;
            this.leftCursorController = interaction.leftCursorControllerEl.components["cursor-controller"];
            this.leftRaycaster = this.leftCursorController.raycaster;
            this.rightCursorController = interaction.rightCursorControllerEl.components["cursor-controller"];
            this.rightRaycaster = this.rightCursorController.raycaster;

            this.viewingCamera = document.getElementById("viewing-camera").object3DMap.camera;
        }
    }

    getIntersection(interactor, targets) {
        this.getRefs();
        let object3D = interactor.cursor;
        let raycaster = object3D === this.leftEventer ? this.leftRaycaster : this.rightRaycaster;

        let intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            return intersects[0];
        }
        return null;
    }

    startDrag(e) {
        if (this.isDragging) {
            return false;
        }
        this.getRefs();

        this.plane = e.object3D === this.leftEventer ? planeForLeftCursor : planeForRightCursor;

        setMatrixWorld(this.plane, calculatePlaneMatrix(this.viewingCamera, this.el.object3D));
        this.planeRotation.extractRotation(this.plane.matrixWorld);
        this.planeUp.set(0, 1, 0).applyMatrix4(this.planeRotation);
        this.planeRight.set(1, 0, 0).applyMatrix4(this.planeRotation);
        this.raycaster = e.object3D === this.leftEventer ? this.leftRaycaster : this.rightRaycaster;
        const intersection = this.raycastOnPlane();

        // shouldn't happen, but we should check
        if (!intersection) return false;

        this.isDragging = true;
        this.dragInteractor = {
            cursor: e.object3D,
            controller: e.object3D === this.leftEventer ? this.leftCursorController : this.rightCursorController,
        };

        this.initialIntersectionPoint.copy(intersection.point);
        this.initialDistanceToObject = this.objectToCam
            .subVectors(
                this.camPosition.setFromMatrixPosition(this.viewingCamera.matrixWorld),
                this.objectPosition.setFromMatrixPosition(this.el.object3D.matrixWorld)
            )
            .length();
        this.intersectionRight = 0;
        this.intersectionUp = 0;
        this.delta = {
            x: 0,
            y: 0
        };

        return true
    }

    endDrag(e) {
        if (!this.isDragging) {
            return;
        }
        if (
            (e.object3D === this.leftEventer && this.raycaster === this.leftRaycaster) ||
            (e.object3D !== this.leftEventer && this.raycaster === this.rightRaycaster)
        ) {
            this.isDragging = false;
            this.dragInteractor = null;
        }
    }

    raycastOnPlane() {
        this.intersections.length = 0;
        const far = this.raycaster.far;
        this.raycaster.far = 1000;
        this.plane.raycast(this.raycaster, this.intersections);
        this.raycaster.far = far;
        return this.intersections[0];
    }

    drag() {
        if (!this.isDragging) return null;
        const intersection = this.raycastOnPlane();
        if (!intersection) return null;
        this.intersectionPoint.copy(intersection.point);
        this.dragVector.subVectors(this.intersectionPoint, this.initialIntersectionPoint);
        this.delta.x = this.dragVector.dot(this.planeUp);
        this.delta.y = this.dragVector.dot(this.planeRight);
        return this.dragVector;
    }
}


// template

function interactiveComponentTemplate(componentName) {
    return {
        startInit: function () {
            this.fullName = this.el.parentEl.parentEl.className;
            this.relativeSize = 1;
            this.isDraggable = false;
            this.isInteractive = false;
            this.isNetworked = false;
        },

        finishInit: function () {
            let root = findAncestorWithComponent(this.el, "gltf-model-plus");
            root && root.addEventListener("model-loaded", (ev) => {
                this.internalInit();
            });
        },

        removeTemplate: function () {
            if (this.isInteractive) {
                this.simpleContainer.object3D.removeEventListener('interact', this.clicked);
            }
            this.el.removeChild(this.simpleContainer);
            this.simpleContainer = null;
    
            if (this.isNetworked && this.netEntity.parentNode) {
                this.netEntity.parentNode.removeChild(this.netEntity);
            }    
        },

        internalInit: function () {
            // each time we load a component we will possibly create
            // a new networked component.  This is fine, since the networked Id 
            // is based on the name passed as a parameter, or assigned to the
            // component in Spoke.  It does mean that if we have
            // multiple objects in the scene which have the same name, they will
            // be in sync.  It also means that if you want to drop a component on
            // the scene via a .glb, it must have a valid name parameter inside it.
            // A .glb in spoke will fall back to the spoke name if you use one without
            // a name inside it.
            let loader = () => {
                // lets load something externally, like a json config file
                this.loadData().then(() => {
                    if (this.isNetworked) {
                        // get the parent networked entity, when it's finished initializing.  
                        // When creating this as part of a GLTF load, the 
                        // parent a few steps up will be networked. 
                        this.netEntity = null;

                        // bind callbacks
                        this.getSharedData = this.getSharedData.bind(this);
                        this.setSharedData = this.setSharedData.bind(this);
                    }

                    // set up the local content and hook it to the scene
                    this.simpleContainer = document.createElement('a-entity');
                    this.simpleContainer.object3D.matrixAutoUpdate = true;

                    this.initializeData();
                    // lets figure out the scale, by scaling to fill the a 1x1m square, that has also
                    // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                    // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                    // set there.

                    // TODO: need to find environment-scene, go down two levels to the group above 
                    // the nodes in the scene.  Then accumulate the scales up from this node to
                    // that node.  This will account for groups, and nesting.

                    var width = 1,
                        height = 1;
                    if (this.el.components["media-image"]) {
                        // attached to an image in spoke, so the image mesh is size 1 and is scaled directly
                        let scaleM = this.el.object3DMap["mesh"].scale;
                        let scaleI = this.el.object3D.scale;
                        width = scaleM.x * scaleI.x;
                        height = scaleM.y * scaleI.y;
                        scaleI.x = 1;
                        scaleI.y = 1;
                        scaleI.z = 1;
                        this.el.object3D.matrixNeedsUpdate = true;
                    } else {
                        // PROBABLY DONT NEED TO SUPPORT THIS ANYMORE
                        // it's embedded in a simple gltf model;  other models may not work
                        // we assume it's at the top level mesh, and that the model itself is scaled
                        let mesh = this.el.object3DMap["mesh"];
                        if (mesh) {
                            let box = mesh.geometry.boundingBox;
                            width = (box.max.x - box.min.x) * mesh.scale.x;
                            height = (box.max.y - box.min.y) * mesh.scale.y;
                        } else {
                            let meshScale = this.el.object3D.scale;
                            width = meshScale.x;
                            height = meshScale.y;
                            meshScale.x = 1;
                            meshScale.y = 1;
                            meshScale.z = 1;
                            this.el.object3D.matrixNeedsUpdate = true;
                        }
                        // apply the root gltf scale.
                        var parent2 = this.el.parentEl.parentEl.object3D;
                        width *= parent2.scale.x;
                        height *= parent2.scale.y;
                        parent2.scale.x = 1;
                        parent2.scale.y = 1;
                        parent2.scale.z = 1;
                        parent2.matrixNeedsUpdate = true;
                    }

                    if (width > 0 && height > 0) {
                        var scale = Math.min(width * this.relativeSize, height * this.relativeSize);
                        this.simpleContainer.setAttribute("scale", {
                            x: scale,
                            y: scale,
                            z: scale
                        });
                    }

                    // there might be some elements already, like the cube we created in blender
                    // and attached this component to, so hide them if they are there.
                    for (const c of this.el.object3D.children) {
                        c.visible = false;
                    }

                    // add in our container
                    this.el.appendChild(this.simpleContainer);

                    // TODO:  we are going to have to make sure this works if 
                    // the component is ON an interactable (like an image)

                    if (this.isInteractive) {
                        this.handleInteraction = new HandleInteraction(this.el);

                        // make the object clickable
                        this.simpleContainer.setAttribute('is-remote-hover-target', '');
                        this.simpleContainer.setAttribute('tags', {
                            singleActionButton: true,
                            inspectable: true,
                            isStatic: true,
                            togglesHoveredActionSet: true
                        });
                        this.simpleContainer.setAttribute('class', "interactable");

                        // forward the 'interact' events to our object 
                        this.clicked = this.clicked.bind(this);
                        this.simpleContainer.object3D.addEventListener('interact', this.clicked);

                        if (this.isDraggable) {
                            // we aren't going to really deal with this till we have a use case, but
                            // we can set it up for now
                            this.simpleContainer.setAttribute('tags', {
                                singleActionButton: true,
                                isHoldable: true,
                                holdableButton: true,
                                inspectable: true,
                                isStatic: true,
                                togglesHoveredActionSet: true
                            });

                            this.dragStart = this.dragStart.bind(this);
                            this.dragEnd = this.dragEnd.bind(this);
                            this.simpleContainer.object3D.addEventListener('holdable-button-down', (evt) => {
                                this.dragStart(evt);
                            });
                            this.simpleContainer.object3D.addEventListener('holdable-button-up', (evt) => {
                                this.dragEnd(evt);
                            });
                        }

                        //this.raycaster = new THREE.Raycaster()
                        this.hoverRayL = new THREE.Ray();
                        this.hoverRayR = new THREE.Ray();
                    } else {
                        // no interactivity, please
                        if (this.el.classList.contains("interactable")) {
                            this.el.classList.remove("interactable");
                        }
                        this.el.removeAttribute("is-remote-hover-target");
                    }

                    // TODO: this SHOULD work but make sure it works if the el we are on
                    // is networked, such as when attached to an image

                    if (this.el.hasAttribute("networked")) {
                        this.el.removeAttribute("networked");
                    }

                    if (this.isNetworked) {
                        // This function finds an existing copy of the Networked Entity (if we are not the
                        // first client in the room it will exist in other clients and be created by NAF)
                        // or create an entity if we are first.
                        this.setupNetworkedEntity = function (networkedEl) {
                            var persistent = true;
                            var netId;
                            if (networkedEl) {
                                // We will be part of a Networked GLTF if the GLTF was dropped on the scene
                                // or pinned and loaded when we enter the room.  Use the networked parents
                                // networkId plus a disambiguating bit of text to create a unique Id.
                                netId = NAF.utils.getNetworkId(networkedEl) + "-" + componentName;

                                // if we need to create an entity, use the same persistence as our
                                // network entity (true if pinned, false if not)
                                persistent = entity.components.networked.data.persistent;
                            } else {
                                // this only happens if this component is on a scene file, since the
                                // elements on the scene aren't networked.  So let's assume each entity in the
                                // scene will have a unique name.  Adding a bit of text so we can find it
                                // in the DOM when debugging.
                                netId = this.fullName.replaceAll("_", "-") + "-" + componentName;
                            }

                            // check if the networked entity we create for this component already exists. 
                            // otherwise, create it
                            // - NOTE: it is created on the scene, not as a child of this entity, because
                            //   NAF creates remote entities in the scene.
                            var entity;
                            if (NAF.entities.hasEntity(netId)) {
                                entity = NAF.entities.getEntity(netId);
                            } else {
                                entity = document.createElement('a-entity');

                                // store the method to retrieve the data on this entity
                                entity.getSharedData = this.getSharedData;

                                // the "networked" component should have persistent=true, the template and 
                                // networkId set, owner set to "scene" (so that it doesn't update the rest of
                                // the world with it's initial data, and should NOT set creator (the system will do that)
                                entity.setAttribute('networked', {
                                    template: "#" + componentName + "-data-media",
                                    persistent: persistent,
                                    owner: "scene", // so that our initial value doesn't overwrite others
                                    networkId: netId
                                });
                                this.el.sceneEl.appendChild(entity);
                            }

                            // save a pointer to the networked entity and then wait for it to be fully
                            // initialized before getting a pointer to the actual networked component in it
                            this.netEntity = entity;
                            NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                                this.stateSync = networkedEl.components[componentName + "-data"];
                            });
                        };
                        this.setupNetworkedEntity = this.setupNetworkedEntity.bind(this);

                        this.setupNetworked = function () {
                            NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
                                this.setupNetworkedEntity(networkedEl);
                            }).catch(() => {
                                this.setupNetworkedEntity();
                            });
                        };
                        this.setupNetworked = this.setupNetworked.bind(this);

                        // This method handles the different startup cases:
                        // - if the GLTF was dropped on the scene, NAF will be connected and we can 
                        //   immediately initialize
                        // - if the GLTF is in the room scene or pinned, it will likely be created
                        //   before NAF is started and connected, so we wait for an event that is
                        //   fired when Hubs has started NAF
                        if (NAF.connection && NAF.connection.isConnected()) {
                            this.setupNetworked();
                        } else {
                            this.el.sceneEl.addEventListener('didConnectToNetworkedScene', this.setupNetworked);
                        }
                    }
                });
            };
            // if attached to a node with a media-loader component, this means we attached this component
            // to a media object in Spoke.  We should wait till the object is fully loaded.  
            // Otherwise, it was attached to something inside a GLTF (probably in blender)
            if (this.el.components["media-loader"]) {
                this.el.addEventListener("media-loaded", () => {
                    loader();
                }, {
                    once: true
                });
            } else {
                loader();
            }
        }
    }
}

function registerSharedAFRAMEComponents(componentName) {
    //
    // Component for our networked state.  This component does nothing except all us to 
    // change the state when appropriate. We could set this up to signal the component above when
    // something has changed, instead of having the component above poll each frame.
    //

    AFRAME.registerComponent(componentName + '-data', {
        schema: {
            sampledata: {
                type: "string",
                default: "{}"
            },
        },
        init: function () {
            this.setSharedData = this.setSharedData.bind(this);

            this.dataObject = this.el.getSharedData();
            try {
                this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject));
                this.el.setAttribute(componentName + "-data", "sampledata", this.sharedData);
            } catch (e) {
                console.error("Couldn't encode initial data object: ", e, this.dataObject);
                this.sharedData = "{}";
                this.dataObject = {};
            }
            this.changed = false;
        },

        update() {
            this.changed = !(this.sharedData === this.data.sampledata);
            if (this.changed) {
                try {
                    this.dataObject = JSON.parse(decodeURIComponent(this.data.sampledata));

                    // do these after the JSON parse to make sure it has succeeded
                    this.sharedData = this.data.sampledata;
                    this.changed = true;
                } catch (e) {
                    console.error("couldn't parse JSON received in data-sync: ", e);
                    this.sharedData = "{}";
                    this.dataObject = {};
                }
            }
        },

        // it is likely that applyPersistentSync only needs to be called for persistent
        // networked entities, so we _probably_ don't need to do this.  But if there is no
        // persistent data saved from the network for this entity, this command does nothing.
        play() {
            if (this.el.components.networked) {
                // not sure if this is really needed, but can't hurt
                if (APP.utils) { // temporary till we ship new client
                    APP.utils.applyPersistentSync(this.el.components.networked.data.networkId);
                }
            }
        },

        setSharedData(dataObject) {
            if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

            try {
                var dataString = encodeURIComponent(JSON.stringify(dataObject));
                this.sharedData = dataString;
                this.dataObject = dataObject;
                this.el.setAttribute(componentName + "-data", "sampledata", dataString);
                return true
            } catch (e) {
                console.error("can't stringify the object passed to data-sync");
                return false
            }
        }
    });

    // Add our template for our networked object to the a-frame assets object,
    // and a schema to the NAF.schemas.  Both must be there to have custom components work

    const assets = document.querySelector("a-assets");

    assets.insertAdjacentHTML(
        'beforeend',
        `
<template id="` + componentName + `-data-media">
  <a-entity
    ` + componentName + `-data
  ></a-entity>
</template>
`
    );

    NAF.schemas.add({
        template: "#" + componentName + "-data-media",
        components: [{
            component: componentName + "-data",
            property: "sampledata"
        }],
        nonAuthorizedComponents: [{
            component: componentName + "-data",
            property: "sampledata"
        }],

    });
}

/**
 * Description
 * ===========
 * create a threejs object (two cubes, one on the surface of the other) that can be interacted 
 * with and has some networked attributes.
 *
 */

///////////////////////////////////////////////////////////////////////////////
// simple convenience functions 
function randomColor() {
    return new THREE.Color(Math.random(), Math.random(), Math.random());
}

function almostEqualVec3(u, v, epsilon) {
    return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
}
// a lot of the complexity has been pulled out into methods in the object
// created by interactiveComponentTemplate() and registerSharedAFRAMEcomponents().
// Here, we define methods that are used by the object there, to do our object-specific
// work.

// We need to define:
// - AFRAME 
//   - schema
//   - init() method, which should can startInit() and finishInit()
//   - update() and play() if you need them
//   - tick() and tick2() to handle frame updates
//
// - change isNetworked, isInteractive, isDraggable (default: false) to reflect what 
//   the object needs to do.
// - loadData() is an async function that does any slow work (loading things, etc)
//   and is called by finishInit(), which waits till it's done before setting things up
// - initializeData() is called to set up the initial state of the object, a good 
//   place to create the 3D content.  The three.js scene should be added to 
//   this.simpleContainter
// - clicked() is called when the object is clicked
// - dragStart() is called right after clicked() if isDraggable is true, to set up
//   for a possible drag operation
// - dragEnd() is called when the mouse is released
// - drag() should be called each frame while the object is being dragged (between 
//   dragStart() and dragEnd())
// - getInteractors() returns an array of objects for which interaction controls are
//   intersecting the object. There will likely be zero, one, or two of these (if 
//   there are two controllers and both are pointing at the object).  The "cursor"
//   field is a pointer to the small sphere Object3D that is displayed where the 
//   interaction ray touches the object. The "controller" field is the 
///  corresponding controller
//   object that includes things like the rayCaster.
// - getIntersection() takes in the interactor and the three.js object3D array 
//   that should be tested for interaction.

// Note that only the entity that this component is attached to will be "seen"
// by Hubs interaction system, so the entire three.js tree below it triggers
// click and drag events.  The getIntersection() method is needed 

// the componentName must be lowercase, can have hyphens, start with a letter, 
// but no underscores
let componentName = "test-cube";

// get the template part of the object need for the AFRAME component
let template = interactiveComponentTemplate(componentName);

// create the additional parts of the object needed for the AFRAME component
let child = {
    schema: {
        // name is hopefully unique for each instance
        name: {
            type: "string",
            default: ""
        },

        // the template will look for these properties. If they aren't there, then
        // the lookup (this.data.*) will evaluate to falsey
        isNetworked: {
            type: "boolean",
            default: false
        },
        isInteractive: {
            type: "boolean",
            default: true
        },
        isDraggable: {
            type: "boolean",
            default: true
        },

        // our data
        width: {
            type: "number",
            default: 1
        },
        color: {
            type: "string",
            default: ""
        },
        parameter1: {
            type: "string",
            default: ""
        }
    },

    // fullName is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {
        this.startInit();

        // the template uses these to set things up.  relativeSize
        // is used to set the size of the object relative to the size of the image
        // that it's attached to: a size of 1 means 
        //   "the size of 1x1x1 units in the object
        //    space will be the same as the size of the image".  
        // Larger relative sizes will make the object smaller because we are
        // saying that a size of NxNxN maps to the Size of the image, and vice versa.  
        // For example, if the object below is 2,2 in size and we set size 2, then
        // the object will remain the same size as the image. If we leave it at 1,1,
        // then the object will be twice the size of the image. 
        this.relativeSize = this.data.width;

        // override the defaults in the template
        this.isDraggable = this.data.isDraggable;
        this.isInteractive = this.data.isInteractive;
        this.isNetworked = this.data.isNetworked;

        // our potentiall-shared object state (two roations and two colors for the boxes) 
        this.sharedData = {
            color: new THREE.Color(this.data.color.length > 0 ? this.data.color : "grey"),
            rotation: new THREE.Euler(),
            position: new THREE.Vector3(0,0.5,0)
        };

        // some local state
        this.initialEuler = new THREE.Euler();

        // some click/drag state
        this.clickEvent = null;
        this.clickIntersection = null;

        // we should set fullName if we have a meaningful name
        if (this.data.name && this.data.name.length > 0) {
            this.fullName = this.data.name;
        }

        // finish the initialization
        this.finishInit();
    },

    // if anything changed in this.data, we need to update the object.  
    // this is probably not going to happen, but could if another of 
    // our scripts modifies the component properties in the DOM
    update: function () {},

    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
        return
    },

    // called by initTemplate() when the component is being processed.  Here, we create
    // the three.js objects we want, and add them to simpleContainer (an AFrame node 
    // the template created for us).
    initializeData: function () {
        this.box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: this.sharedData.color
            })
        );
        this.box.matrixAutoUpdate = true;
        this.simpleContainer.setObject3D('box', this.box);

        // create a second small, black box on the surface of the box
        this.box2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.1, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: "black"
            })
        );
        this.box2.matrixAutoUpdate = true;
        this.box2.position.copy(this.sharedData.position);

        // add it as a child of the first box, since we want it to move with the first box
        this.box.add(this.box2);

        // IMPORTANT: any three.js object that is added to a Hubs (aframe) entity 
        // must have ".el" pointing to the AFRAME Entity that contains it.
        // When an object3D is added with ".setObject3D", it is added to the 
        // object3D for that Entity, and sets all of the children of that
        // object3D to point to the same Entity.  If you add an object3D to
        // the sub-tree of that object later, you must do this yourself. 
        this.box2.el = this.simpleContainer;

        // tell the portals to update their view
        this.el.sceneEl.emit('updatePortals'); 

    },

    // called from remove() in the template to remove any local resources when the component
    // is destroyed
    remove: function () {
        this.simpleContainer.removeObject3D("box");
        this.box.geometry.dispose();
        this.box.material.dispose();
        this.box2.geometry.dispose();
        this.box2.material.dispose();
        this.removeTemplate();
    },

    // handle "interact" events for clickable entities
    clicked: function (evt) {
        // the evt.target will point at the object3D in this entity.  We can use
        // handleInteraction.getInteractionTarget() to get the more precise 
        // hit information about which object3Ds in our object were hit.  We store
        // the one that was clicked here, so we know which it was as we drag around
        this.clickIntersection = this.handleInteraction.getIntersection(evt.object3D, [evt.target]);
        this.clickEvent = evt;

        if (!this.clickIntersection) {
            console.warn("click didn't hit anything; shouldn't happen");
            return;
        }

        if (this.clickIntersection.object == this.box) {
            // new random color on each click
            let newColor = randomColor();

            this.box.material.color.set(newColor);
            this.sharedData.color.set(newColor);
            this.setSharedData();
        } else if (this.clickIntersection.object == this.box2) ;
    },

    // called to start the drag.  Will be called after clicked() if isDraggable is true
    dragStart: function (evt) {
        // set up the drag state
        if (!this.handleInteraction.startDrag(evt)) {
            return
        }

        // grab a copy of the current orientation of the object we clicked
        if (this.clickIntersection.object == this.box) {
            this.initialEuler.copy(this.box.rotation);
        } else if (this.clickIntersection.object == this.box2) {
            this.box2.material.color.set("red");
        }
    },

    // called when the button is released to finish the drag
    dragEnd: function (evt) {
        this.handleInteraction.endDrag(evt);
        if (this.clickIntersection.object == this.box) ; else if (this.clickIntersection.object == this.box2) {
            this.box2.material.color.set("black");
        }
    },

    // the method setSharedData() always sets the shared data, causing a network update.  
    // We can be smarter here by calling it only when significant changes happen, 
    // which we'll do in the setSharedEuler methods
    setSharedEuler: function (newEuler) {
        if (!almostEqualVec3(this.sharedData.rotation, newEuler, 0.05)) {
            this.sharedData.rotation.copy(newEuler);
            this.setSharedData();
        }
    },
    setSharedPosition: function (newPos) {
        if (!almostEqualVec3(this.sharedData.position, newPos, 0.05)) {
            this.sharedData.position.copy(newPos);
            this.setSharedData();
        }
    },

    // if the object is networked, this.stateSync will exist and should be called
    setSharedData: function () {
        if (this.stateSync) {
            return this.stateSync.setSharedData(this.sharedData)
        }
        return true
    },

    // this is called from the networked data entity to get the initial data 
    // from the component
    getSharedData: function () {
        return this.sharedData
    },

    // per frame stuff
    tick: function (time) {
        if (!this.box) {
            // haven't finished initializing yet
            return;
        }

        // if it's interactive, we'll handle drag and hover events
        if (this.isInteractive) {

            // if we're dragging, update the rotation
            if (this.isDraggable && this.handleInteraction.isDragging) {

                // do something with the dragging. Here, we'll use delta.x and delta.y
                // to rotate the object.  These values are set as a relative offset in
                // the plane perpendicular to the view, so we'll use them to offset the
                // x and y rotation of the object.  This is a TERRIBLE way to do rotate,
                // but it's a simple example.
                if (this.clickIntersection.object == this.box) {
                    // update drag state
                    this.handleInteraction.drag();

                    // compute a new rotation based on the delta
                    this.box.rotation.set(this.initialEuler.x - this.handleInteraction.delta.x,
                        this.initialEuler.y + this.handleInteraction.delta.y,
                        this.initialEuler.z);

                    // update the shared rotation
                    this.setSharedEuler(this.box.rotation);
                } else if (this.clickIntersection.object == this.box2) {

                    // we want to hit test on our boxes, but only want to know if/where
                    // we hit the big box.  So first hide the small box, and then do a
                    // a hit test, which can only result in a hit on the big box.  
                    this.box2.visible = false;
                    let intersect = this.handleInteraction.getIntersection(this.handleInteraction.dragInteractor, [this.box]);
                    this.box2.visible = true;

                    // if we hit the big box, move the small box to the position of the hit
                    if (intersect) {
                        // the intersect object is a THREE.Intersection object, which has the hit point
                        // specified in world coordinates.  So we move those coordinates into the local
                        // coordiates of the big box, and then set the position of the small box to that
                        let position = this.box.worldToLocal(intersect.point);
                        this.box2.position.copy(position);
                        this.setSharedPosition(this.box2.position);
                    }
                }
            } else {
                // do something with the rays when not dragging or clicking.
                // For example, we could display some additional content when hovering
                let passthruInteractor = this.handleInteraction.getInteractors(this.simpleContainer);

                // we will set yellow if either interactor hits the box. We'll keep track of if
                // one does
                let setIt = false;

                // for each of our interactors, check if it hits the scene
                for (let i = 0; i < passthruInteractor.length; i++) {
                    let intersection = this.handleInteraction.getIntersection(passthruInteractor[i], this.simpleContainer.object3D.children);

                    // if we hit the small box, set the color to yellow, and flag that we hit
                    if (intersection && intersection.object === this.box2) {
                        this.box2.material.color.set("yellow");
                        setIt = true;
                    }
                }

                // if we didn't hit, make sure the color remains black
                if (!setIt) {
                    this.box2.material.color.set("black");
                }
            }
        }

        if (this.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) {
                return
            }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false;

                // got the data, now do something with it
                let newData = this.stateSync.dataObject;
                this.sharedData.color.set(newData.color);
                this.sharedData.rotation.copy(newData.rotation);
                this.sharedData.position.copy(newData.position);
                this.box.material.color.set(newData.color);
                this.box.rotation.copy(newData.rotation);
                this.box2.position.copy(newData.position);
            }
        }
    }
};

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
});

// create and register the data component and it's NAF component with the AFrame scene
registerSharedAFRAMEComponents(componentName);

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('shader', 'shader');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script');
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider');
AFRAME.GLTFModelPlus.registerComponent('video-control-pad', 'video-control-pad');
AFRAME.GLTFModelPlus.registerComponent('test-cube', 'test-cube');
// do a simple monkey patch to see if it works
// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }
//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;
// add the region-hider to the scene
// const scene = document.querySelector("a-scene");
// scene.setAttribute("region-hider", {size: 100})
let homePageDesc = document.querySelector('[class^="HomePage__app-description"]');
if (homePageDesc) {
    homePageDesc.innerHTML = "Reality Media Immersive Experience<br><br>After signing in, visit <a href='https://realitymedia.digital'>realitymedia.digital</a> to get started";
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1yb29tLmpzIiwic291cmNlcyI6WyIuLi9zcmMvc3lzdGVtcy9mYWRlci1wbHVzLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcHJveGltaXR5LWV2ZW50cy5qcyIsIi4uL3NyYy91dGlscy9jb21wb25lbnQtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvc2NlbmUtZ3JhcGgudHMiLCIuLi9zcmMvY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMiLCIuLi9zcmMvdXRpbHMvZGVmYXVsdEhvb2tzLnRzIiwiLi4vc3JjL3V0aWxzL01hdGVyaWFsTW9kaWZpZXIudHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lNYWluLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybU9iai50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveVVuaWZvcm1fcGFyYXMudHMiLCIuLi9zcmMvYXNzZXRzL2JheWVyLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyLnRzIiwiLi4vc3JjL3NoYWRlcnMvbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy9saXF1aWQtbWFyYmxlLnRzIiwiLi4vc3JjL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmciLCIuLi9zcmMvc2hhZGVycy9nYWxheHkudHMiLCIuLi9zcmMvc2hhZGVycy9sYWNlLXR1bm5lbC50cyIsIi4uL3NyYy9hc3NldHMvbm9pc2UtMjU2LnBuZyIsIi4uL3NyYy9zaGFkZXJzL2ZpcmUtdHVubmVsLnRzIiwiLi4vc3JjL3NoYWRlcnMvbWlzdC50cyIsIi4uL3NyYy9zaGFkZXJzL21hcmJsZTEudHMiLCIuLi9zcmMvYXNzZXRzL2JhZFNoYWRlci5qcGciLCIuLi9zcmMvc2hhZGVycy9ub3QtZm91bmQudHMiLCIuLi9zcmMvYXNzZXRzL3dhcnBmeC5wbmciLCIuLi9zcmMvc2hhZGVycy93YXJwLnRzIiwiLi4vc3JjL3NoYWRlcnMvc25vaXNlLnRzIiwiLi4vc3JjL3NoYWRlcnMvd2FycC1wb3J0YWwudHMiLCIuLi9zcmMvY29tcG9uZW50cy9zaGFkZXIudHMiLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfQ09MT1IuanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX2dsb3NzaW5lc3MucG5nIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX05STS5qcGciLCIuLi9zcmMvYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfT0NDLmpwZyIsIi4uL3NyYy91dGlscy93cml0ZUN1YmVNYXAuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wb3J0YWwuanMiLCIuLi9zcmMvYXNzZXRzL2JhbGxmeC5wbmciLCIuLi9zcmMvc2hhZGVycy9wYW5vYmFsbC52ZXJ0LmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFub2JhbGwuZnJhZy5qcyIsIi4uL3NyYy9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMiLCIuLi9zcmMvc2hhZGVycy9wYXJhbGxheC1zaGFkZXIuanMiLCIuLi9zcmMvY29tcG9uZW50cy9wYXJhbGxheC5qcyIsIi4uL3NyYy9hc3NldHMvU3Bpbm5lci0xcy0yMDBweC5wbmciLCIuLi9zcmMvY29tcG9uZW50cy9odG1sLXNjcmlwdC5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3ZpZGVvLWNvbnRyb2wtcGFkLnRzIiwiLi4vc3JjL3V0aWxzL3RocmVlLXV0aWxzLmpzIiwiLi4vc3JjL3V0aWxzL2ludGVyYWN0aW9uLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvdGhyZWUtc2FtcGxlLmpzIiwiLi4vc3JjL3Jvb21zL21haW4tcm9vbS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdmYWRlci1wbHVzJywge1xuICBzY2hlbWE6IHtcbiAgICBkaXJlY3Rpb246IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6ICdub25lJyB9LCAvLyBcImluXCIsIFwib3V0XCIsIG9yIFwibm9uZVwiXG4gICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDIwMCB9LCAvLyBUcmFuc2l0aW9uIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kc1xuICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6ICd3aGl0ZScgfSxcbiAgfSxcblxuICBpbml0KCkge1xuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgpLFxuICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgY29sb3I6IHRoaXMuZGF0YS5jb2xvcixcbiAgICAgICAgc2lkZTogVEhSRUUuQmFja1NpZGUsXG4gICAgICAgIG9wYWNpdHk6IDAsXG4gICAgICAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICBmb2c6IGZhbHNlLFxuICAgICAgfSlcbiAgICApXG4gICAgbWVzaC5zY2FsZS54ID0gbWVzaC5zY2FsZS55ID0gMVxuICAgIG1lc2guc2NhbGUueiA9IDAuMTVcbiAgICBtZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgIG1lc2gucmVuZGVyT3JkZXIgPSAxIC8vIHJlbmRlciBhZnRlciBvdGhlciB0cmFuc3BhcmVudCBzdHVmZlxuICAgIHRoaXMuZWwuY2FtZXJhLmFkZChtZXNoKVxuICAgIHRoaXMubWVzaCA9IG1lc2hcbiAgfSxcblxuICBmYWRlT3V0KCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignb3V0JylcbiAgfSxcblxuICBmYWRlSW4oKSB7XG4gICAgcmV0dXJuIHRoaXMuYmVnaW5UcmFuc2l0aW9uKCdpbicpXG4gIH0sXG5cbiAgYXN5bmMgYmVnaW5UcmFuc2l0aW9uKGRpcmVjdGlvbikge1xuICAgIGlmICh0aGlzLl9yZXNvbHZlRmluaXNoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmYWRlIHdoaWxlIGEgZmFkZSBpcyBoYXBwZW5pbmcuJylcbiAgICB9XG5cbiAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnZmFkZXItcGx1cycsIHsgZGlyZWN0aW9uIH0pXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlcykgPT4ge1xuICAgICAgaWYgKHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID09PSAoZGlyZWN0aW9uID09ICdpbicgPyAwIDogMSkpIHtcbiAgICAgICAgcmVzKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSByZXNcbiAgICAgIH1cbiAgICB9KVxuICB9LFxuXG4gIHRpY2sodCwgZHQpIHtcbiAgICBjb25zdCBtYXQgPSB0aGlzLm1lc2gubWF0ZXJpYWxcbiAgICB0aGlzLm1lc2gudmlzaWJsZSA9IHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnIHx8IG1hdC5vcGFjaXR5ICE9PSAwXG4gICAgaWYgKCF0aGlzLm1lc2gudmlzaWJsZSkgcmV0dXJuXG5cbiAgICBpZiAodGhpcy5kYXRhLmRpcmVjdGlvbiA9PT0gJ2luJykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1heCgwLCBtYXQub3BhY2l0eSAtICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdvdXQnKSB7XG4gICAgICBtYXQub3BhY2l0eSA9IE1hdGgubWluKDEsIG1hdC5vcGFjaXR5ICsgKDEuMCAvIHRoaXMuZGF0YS5kdXJhdGlvbikgKiBNYXRoLm1pbihkdCwgNTApKVxuICAgIH1cblxuICAgIGlmIChtYXQub3BhY2l0eSA9PT0gMCB8fCBtYXQub3BhY2l0eSA9PT0gMSkge1xuICAgICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gIT09ICdub25lJykge1xuICAgICAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2goKVxuICAgICAgICAgIHRoaXMuX3Jlc29sdmVGaW5pc2ggPSBudWxsXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbjogJ25vbmUnIH0pXG4gICAgfVxuICB9LFxufSlcbiIsImNvbnN0IHdvcmxkQ2FtZXJhID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRTZWxmID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3Byb3hpbWl0eS1ldmVudHMnLCB7XG4gIHNjaGVtYToge1xuICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9LFxuICAgIGZ1eno6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuMSB9LFxuICAgIFlvZmZzZXQ6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAgfSxcbiAgfSxcbiAgaW5pdCgpIHtcbiAgICB0aGlzLmluWm9uZSA9IGZhbHNlXG4gICAgdGhpcy5jYW1lcmEgPSB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhXG4gIH0sXG4gIHRpY2soKSB7XG4gICAgdGhpcy5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgIGNvbnN0IHdhc0luem9uZSA9IHRoaXMuaW5ab25lXG5cbiAgICB3b3JsZENhbWVyYS55IC09IHRoaXMuZGF0YS5Zb2Zmc2V0XG4gICAgdmFyIGRpc3QgPSB3b3JsZENhbWVyYS5kaXN0YW5jZVRvKHdvcmxkU2VsZilcbiAgICB2YXIgdGhyZXNob2xkID0gdGhpcy5kYXRhLnJhZGl1cyArICh0aGlzLmluWm9uZSA/IHRoaXMuZGF0YS5mdXp6ICA6IDApXG4gICAgdGhpcy5pblpvbmUgPSBkaXN0IDwgdGhyZXNob2xkXG4gICAgaWYgKHRoaXMuaW5ab25lICYmICF3YXNJbnpvbmUpIHRoaXMuZWwuZW1pdCgncHJveGltaXR5ZW50ZXInKVxuICAgIGlmICghdGhpcy5pblpvbmUgJiYgd2FzSW56b25lKSB0aGlzLmVsLmVtaXQoJ3Byb3hpbWl0eWxlYXZlJylcbiAgfSxcbn0pXG4iLCIvLyBQcm92aWRlcyBhIGdsb2JhbCByZWdpc3RyeSBvZiBydW5uaW5nIGNvbXBvbmVudHNcbi8vIGNvcGllZCBmcm9tIGh1YnMgc291cmNlXG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5IHx8IHt9O1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0gPSB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdIHx8IFtdO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0ucHVzaChjb21wb25lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKGNvbXBvbmVudCwgbmFtZSkge1xuICAgIGlmICghd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSkgcmV0dXJuO1xuICAgIHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uc3BsaWNlKHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0uaW5kZXhPZihjb21wb25lbnQpLCAxKTtcbn1cbiAgIiwiLy8gY29waWVkIGZyb20gaHVic1xuaW1wb3J0IHsgRW50aXR5LCBDb21wb25lbnQgfSBmcm9tICdhZnJhbWUnXG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KGVudGl0eTogRW50aXR5LCBjb21wb25lbnROYW1lOiBzdHJpbmcpOiBFbnRpdHkgfCBudWxsIHtcbiAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5LmNvbXBvbmVudHMgJiYgZW50aXR5LmNvbXBvbmVudHNbY29tcG9uZW50TmFtZV0pKSB7XG4gICAgICBlbnRpdHkgPSAoZW50aXR5LnBhcmVudE5vZGUgYXMgRW50aXR5KTtcbiAgICB9XG4gICAgcmV0dXJuIGVudGl0eTtcbiAgfVxuICBcbiAgZXhwb3J0IGZ1bmN0aW9uIGZpbmRDb21wb25lbnRzSW5OZWFyZXN0QW5jZXN0b3IoZW50aXR5OiBFbnRpdHksIGNvbXBvbmVudE5hbWU6IHN0cmluZyk6IENvbXBvbmVudFtdIHtcbiAgICBjb25zdCBjb21wb25lbnRzID0gW107XG4gICAgd2hpbGUgKGVudGl0eSkge1xuICAgICAgaWYgKGVudGl0eS5jb21wb25lbnRzKSB7XG4gICAgICAgIGZvciAoY29uc3QgYyBpbiBlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50c1tjXS5uYW1lID09PSBjb21wb25lbnROYW1lKSB7XG4gICAgICAgICAgICBjb21wb25lbnRzLnB1c2goZW50aXR5LmNvbXBvbmVudHNbY10pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBjb21wb25lbnRzO1xuICAgICAgfVxuICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGUgYXMgRW50aXR5O1xuICAgIH1cbiAgICByZXR1cm4gY29tcG9uZW50cztcbiAgfVxuICAiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogYnJlYWsgdGhlIHJvb20gaW50byBxdWFkcmFudHMgb2YgYSBjZXJ0YWluIHNpemUsIGFuZCBoaWRlIHRoZSBjb250ZW50cyBvZiBhcmVhcyB0aGF0IGhhdmVcbiAqIG5vYm9keSBpbiB0aGVtLiAgTWVkaWEgd2lsbCBiZSBwYXVzZWQgaW4gdGhvc2UgYXJlYXMgdG9vLlxuICogXG4gKiBJbmNsdWRlIGEgd2F5IGZvciB0aGUgcG9ydGFsIGNvbXBvbmVudCB0byB0dXJuIG9uIGVsZW1lbnRzIGluIHRoZSByZWdpb24gb2YgdGhlIHBvcnRhbCBiZWZvcmVcbiAqIGl0IGNhcHR1cmVzIGEgY3ViZW1hcFxuICovXG5cbmltcG9ydCB7IHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UsIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSB9IGZyb20gXCIuLi91dGlscy9jb21wb25lbnQtdXRpbHNcIjtcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tIFwiLi4vdXRpbHMvc2NlbmUtZ3JhcGhcIjtcblxuIC8vIGFyYml0cmFyaWx5IGNob29zZSAxMDAwMDAwIGFzIHRoZSBudW1iZXIgb2YgY29tcHV0ZWQgem9uZXMgaW4gIHggYW5kIHlcbmxldCBNQVhfWk9ORVMgPSAxMDAwMDAwXG5sZXQgcmVnaW9uVGFnID0gZnVuY3Rpb24oc2l6ZSwgb2JqM2QpIHtcbiAgICBsZXQgcG9zID0gb2JqM2QucG9zaXRpb25cbiAgICBsZXQgeHAgPSBNYXRoLmZsb29yKHBvcy54IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIGxldCB6cCA9IE1hdGguZmxvb3IocG9zLnogLyBzaXplKSArIE1BWF9aT05FUy8yXG4gICAgcmV0dXJuIE1BWF9aT05FUyAqIHhwICsgenBcbn1cblxubGV0IHJlZ2lvbnNJblVzZSA9IFtdXG5cbi8qKlxuICogRmluZCB0aGUgY2xvc2VzdCBhbmNlc3RvciAoaW5jbHVkaW5nIHRoZSBwYXNzZWQgaW4gZW50aXR5KSB0aGF0IGhhcyBhbiBgb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcmAgY29tcG9uZW50LFxuICogYW5kIHJldHVybiB0aGF0IGNvbXBvbmVudFxuICovXG5mdW5jdGlvbiBnZXRSZWdpb25Gb2xsb3dlcihlbnRpdHkpIHtcbiAgICBsZXQgY3VyRW50aXR5ID0gZW50aXR5O1xuICBcbiAgICB3aGlsZShjdXJFbnRpdHkgJiYgY3VyRW50aXR5LmNvbXBvbmVudHMgJiYgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICBjdXJFbnRpdHkgPSBjdXJFbnRpdHkucGFyZW50Tm9kZTtcbiAgICB9XG4gIFxuICAgIGlmICghY3VyRW50aXR5IHx8ICFjdXJFbnRpdHkuY29tcG9uZW50cyB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHNbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXVxufVxuICBcbmZ1bmN0aW9uIGFkZFRvUmVnaW9uKHJlZ2lvbikge1xuICAgIHJlZ2lvbnNJblVzZVtyZWdpb25dID8gcmVnaW9uc0luVXNlW3JlZ2lvbl0rKyA6IHJlZ2lvbnNJblVzZVtyZWdpb25dID0gMVxuICAgIGNvbnNvbGUubG9nKFwiQXZhdGFycyBpbiByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMSkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHRydWUpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJhbHJlYWR5IGFub3RoZXIgYXZhdGFyIGluIHRoaXMgcmVnaW9uLCBubyBjaGFuZ2VcIilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN1YnRyYWN0RnJvbVJlZ2lvbihyZWdpb24pIHtcbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0pIHtyZWdpb25zSW5Vc2VbcmVnaW9uXS0tIH1cbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgbGVmdCByZWdpb24gXCIgKyByZWdpb24gKyBcIjogXCIgKyByZWdpb25zSW5Vc2VbcmVnaW9uXSlcblxuICAgIGlmIChyZWdpb25zSW5Vc2VbcmVnaW9uXSA9PSAwKSB7XG4gICAgICAgIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgZmFsc2UpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJzdGlsbCBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1JlZ2lvbkZvck9iamVjdChlbGVtZW50KSB7XG4gICAgbGV0IGZvbGxvd2VyID0gZ2V0UmVnaW9uRm9sbG93ZXIoZWxlbWVudClcbiAgICBpZiAoIWZvbGxvd2VyKSB7IHJldHVybiB9XG5cbiAgICBjb25zb2xlLmxvZyhcInNob3dpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgYWRkVG9SZWdpb24oZm9sbG93ZXIucmVnaW9uKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZXJSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJoaWRpbmcgb2JqZWN0cyBuZWFyIFwiICsgZm9sbG93ZXIuZWwuY2xhc3NOYW1lKVxuXG4gICAgc3VidHJhY3RGcm9tUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZnVuY3Rpb24gc2hvd0hpZGVPYmplY3RzKCkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKFwic2hvd2luZy9oaWRpbmcgYWxsIG9iamVjdHNcIilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2Vbb2JqLnJlZ2lvbl0gPyB0cnVlOiBmYWxzZVxuICAgICAgICBcbiAgICAgIGlmIChvYmouZWwub2JqZWN0M0QudmlzaWJsZSA9PSB2aXNpYmxlKSB7IGNvbnRpbnVlIH1cblxuICAgICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nIFwiIDogXCJoaWRpbmcgXCIpICsgb2JqLmVsLmNsYXNzTmFtZSlcbiAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0c0luUmVnaW9uKHJlZ2lvbiwgdmlzaWJsZSkge1xuICAgIGlmICghd2luZG93LkFQUCB8fCAhd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgY29uc29sZS5sb2cgKCh2aXNpYmxlID8gXCJzaG93aW5nXCIgOiBcImhpZGluZ1wiKSArIFwiIGFsbCBvYmplY3RzIGluIHJlZ2lvbiBcIiArIHJlZ2lvbilcbiAgICBjb25zdCBvYmplY3RzID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0gfHwgW107XG4gIFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb2JqZWN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgb2JqID0gb2JqZWN0c1tpXTtcbiAgICAgIFxuICAgICAgaWYgKG9iai5yZWdpb24gPT0gcmVnaW9uKSB7XG4gICAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiIGhpZGluZ1wiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICAgIG9iai5zaG93SGlkZSh2aXNpYmxlKVxuICAgICAgfVxuICAgIH1cbiAgXG4gICAgcmV0dXJuIG51bGw7XG59XG4gIFxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdhdmF0YXItcmVnaW9uLWZvbGxvd2VyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBzaXplOiB7IGRlZmF1bHQ6IDEwIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXZhdGFyOiByZWdpb24gXCIsIHRoaXMucmVnaW9uKVxuICAgICAgICBhZGRUb1JlZ2lvbih0aGlzLnJlZ2lvbilcblxuICAgICAgICByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlKHRoaXMsIFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiKTtcbiAgICB9LFxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgICAgIHN1YnRyYWN0RnJvbVJlZ2lvbih0aGlzLnJlZ2lvbilcbiAgICB9LFxuXG4gICAgdGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbmV3UmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBpZiAobmV3UmVnaW9uICE9IHRoaXMucmVnaW9uKSB7XG4gICAgICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgICAgICAgICBhZGRUb1JlZ2lvbihuZXdSZWdpb24pXG4gICAgICAgICAgICB0aGlzLnJlZ2lvbiA9IG5ld1JlZ2lvblxuICAgICAgICB9XG4gICAgfSxcbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9LFxuICAgICAgICBkeW5hbWljOiB7IGRlZmF1bHQ6IHRydWUgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcblxuICAgICAgICB0aGlzLnNob3dIaWRlID0gdGhpcy5zaG93SGlkZS5iaW5kKHRoaXMpXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgdGhpcy53YXNQYXVzZWQgPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkXG4gICAgICAgIH1cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUgZG9uJ3QgbW92ZVxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5keW5hbWljKSB7IHJldHVybiB9XG5cbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgbGV0IHZpc2libGUgPSByZWdpb25zSW5Vc2VbdGhpcy5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIGhhbmRsZSBzaG93L2hpZGluZyB0aGUgb2JqZWN0c1xuICAgICAgICB0aGlzLnNob3dIaWRlKHZpc2libGUpXG4gICAgfSxcblxuICAgIHNob3dIaWRlOiBmdW5jdGlvbiAodmlzaWJsZSkge1xuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gdmlzaWJsZVxuXG4gICAgICAgIC8vLyBjaGVjayBmb3IgbWVkaWEtdmlkZW8gY29tcG9uZW50IG9uIHBhcmVudCB0byBzZWUgaWYgd2UncmUgYSB2aWRlby4gIEFsc28gc2FtZSBmb3IgYXVkaW9cbiAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdKSB7XG4gICAgICAgICAgICBpZiAodmlzaWJsZSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLndhc1BhdXNlZCAhPSB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS5kYXRhLnZpZGVvUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICAgICAgICAgIGlmICghdGhpcy53YXNQYXVzZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0udG9nZ2xlUGxheWluZygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncmVnaW9uLWhpZGVyJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIGEgcGFyZW50IHdpdGggXCJuYXYtbWVzaC1oZWxwZXJcIiwgdGhpcyBpcyBpbiB0aGUgc2NlbmUuICBcbiAgICAgICAgLy8gSWYgbm90LCBpdCdzIGluIGFuIG9iamVjdCB3ZSBkcm9wcGVkIG9uIHRoZSB3aW5kb3csIHdoaWNoIHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgaWYgKCFmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwibmF2LW1lc2gtaGVscGVyXCIpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyZWdpb24taGlkZXIgY29tcG9uZW50IG11c3QgYmUgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGdsYi5cIilcbiAgICAgICAgICAgIHRoaXMuc2l6ZSA9IDA7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmKHRoaXMuZGF0YS5zaXplID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS5zaXplID0gMTA7XG4gICAgICAgICAgICB0aGlzLnNpemUgPSB0aGlzLnBhcnNlTm9kZU5hbWUodGhpcy5kYXRhLnNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhpcy5uZXdTY2VuZSA9IHRoaXMubmV3U2NlbmUuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLm5ld1NjZW5lKVxuICAgICAgICAvLyBjb25zdCBlbnZpcm9ubWVudFNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbnZpcm9ubWVudC1zY2VuZVwiKTtcbiAgICAgICAgLy8gdGhpcy5hZGRTY2VuZUVsZW1lbnQgPSB0aGlzLmFkZFNjZW5lRWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50ID0gdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1hdHRhY2hlZFwiLCB0aGlzLmFkZFNjZW5lRWxlbWVudClcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVTY2VuZUVsZW1lbnQpXG5cbiAgICAgICAgLy8gd2Ugd2FudCB0byBub3RpY2Ugd2hlbiBuZXcgdGhpbmdzIGdldCBhZGRlZCB0byB0aGUgcm9vbS4gIFRoaXMgd2lsbCBoYXBwZW4gZm9yXG4gICAgICAgIC8vIG9iamVjdHMgZHJvcHBlZCBpbiB0aGUgcm9vbSwgb3IgZm9yIG5ldyByZW1vdGUgYXZhdGFycywgYXQgbGVhc3RcbiAgICAgICAgLy8gdGhpcy5hZGRSb290RWxlbWVudCA9IHRoaXMuYWRkUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVJvb3RFbGVtZW50ID0gdGhpcy5yZW1vdmVSb290RWxlbWVudC5iaW5kKHRoaXMpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRSb290RWxlbWVudClcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGlsZC1kZXRhY2hlZFwiLCB0aGlzLnJlbW92ZVJvb3RFbGVtZW50KVxuXG4gICAgICAgIC8vIHdhbnQgdG8gc2VlIGlmIHRoZXJlIGFyZSBwaW5uZWQgb2JqZWN0cyB0aGF0IHdlcmUgbG9hZGVkIGZyb20gaHVic1xuICAgICAgICBsZXQgcm9vbU9iamVjdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiUm9vbU9iamVjdHNcIilcbiAgICAgICAgdGhpcy5yb29tT2JqZWN0cyA9IHJvb21PYmplY3RzLmxlbmd0aCA+IDAgPyByb29tT2JqZWN0c1swXSA6IG51bGxcblxuICAgICAgICAvLyBnZXQgYXZhdGFyc1xuICAgICAgICBjb25zdCBhdmF0YXJzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbcGxheWVyLWluZm9dXCIpO1xuICAgICAgICBhdmF0YXJzLmZvckVhY2goKGF2YXRhcikgPT4ge1xuICAgICAgICAgICAgYXZhdGFyLnNldEF0dHJpYnV0ZShcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayBvYmplY3RzIGluIHRoZSByb290ICh0aGluZ3MgdGhhdCBoYXZlIGJlZW4gZHJvcHBlZCBvbiB0aGUgc2NlbmUpXG4gICAgICAgIC8vIC0gZHJhd2luZ3MgaGF2ZSBjbGFzcz1cImRyYXdpbmdcIiwgbmV0d29ya2VkLWRyYXdpbmdcbiAgICAgICAgLy8gTm90IGdvaW5nIHRvIGRvIGRyYXdpbmdzIHJpZ2h0IG5vdy5cblxuICAgICAgICAvLyBwaW5uZWQgbWVkaWEgbGl2ZSB1bmRlciBhIG5vZGUgd2l0aCBjbGFzcz1cIlJvb21PYmplY3RzXCJcbiAgICAgICAgdmFyIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuUm9vbU9iamVjdHMgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIC0gY2FtZXJhIGhhcyBjYW1lcmEtdG9vbCAgICAgICAgXG4gICAgICAgIC8vIC0gaW1hZ2UgZnJvbSBjYW1lcmEsIG9yIGRyb3BwZWQsIGhhcyBtZWRpYS1sb2FkZXIsIG1lZGlhLWltYWdlLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSBnbGIgaGFzIG1lZGlhLWxvYWRlciwgZ2x0Zi1tb2RlbC1wbHVzLCBsaXN0ZWQtbWVkaWFcbiAgICAgICAgLy8gLSB2aWRlbyBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS12aWRlbywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vXG4gICAgICAgIC8vICBzbywgZ2V0IGFsbCBjYW1lcmEtdG9vbHMsIGFuZCBtZWRpYS1sb2FkZXIgb2JqZWN0cyBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBzY2VuZVxuICAgICAgICBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2NhbWVyYS10b29sXSwgYS1zY2VuZSA+IFttZWRpYS1sb2FkZXJdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyB3YWxrIHRoZSBvYmplY3RzIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZS4gIE11c3Qgd2FpdCBmb3Igc2NlbmUgdG8gZmluaXNoIGxvYWRpbmdcbiAgICAgICAgdGhpcy5zY2VuZUxvYWRlZCA9IHRoaXMuc2NlbmVMb2FkZWQuYmluZCh0aGlzKVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcblxuICAgIH0sXG5cbiAgICBpc0FuY2VzdG9yOiBmdW5jdGlvbiAocm9vdCwgZW50aXR5KSB7XG4gICAgICAgIHdoaWxlIChlbnRpdHkgJiYgIShlbnRpdHkgPT0gcm9vdCkpIHtcbiAgICAgICAgICBlbnRpdHkgPSBlbnRpdHkucGFyZW50Tm9kZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gKGVudGl0eSA9PSByb290KTtcbiAgICB9LFxuICAgIFxuICAgIC8vIFRoaW5ncyB3ZSBkb24ndCB3YW50IHRvIGhpZGU6XG4gICAgLy8gLSBbd2F5cG9pbnRdXG4gICAgLy8gLSBwYXJlbnQgb2Ygc29tZXRoaW5nIHdpdGggW25hdm1lc2hdIGFzIGEgY2hpbGQgKHRoaXMgaXMgdGhlIG5hdmlnYXRpb24gc3R1ZmZcbiAgICAvLyAtIHRoaXMuZWwucGFyZW50RWwucGFyZW50RWxcbiAgICAvLyAtIFtza3lib3hdXG4gICAgLy8gLSBbZGlyZWN0aW9uYWwtbGlnaHRdXG4gICAgLy8gLSBbYW1iaWVudC1saWdodF1cbiAgICAvLyAtIFtoZW1pc3BoZXJlLWxpZ2h0XVxuICAgIC8vIC0gI0NvbWJpbmVkTWVzaFxuICAgIC8vIC0gI3NjZW5lLXByZXZpZXctY2FtZXJhIG9yIFtzY2VuZS1wcmV2aWV3LWNhbWVyYV1cbiAgICAvL1xuICAgIC8vIHdlIHdpbGwgZG9cbiAgICAvLyAtIFttZWRpYS1sb2FkZXJdXG4gICAgLy8gLSBbc3BvdC1saWdodF1cbiAgICAvLyAtIFtwb2ludC1saWdodF1cbiAgICBzY2VuZUxvYWRlZDogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgbm9kZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImVudmlyb25tZW50LXNjZW5lXCIpLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdXG4gICAgICAgIC8vdmFyIG5vZGVzID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5wYXJlbnRFbC5jaGlsZE5vZGVzO1xuICAgICAgICBmb3IgKGxldCBpPTA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbGV0IG5vZGUgPSBub2Rlc1tpXVxuICAgICAgICAgICAgLy9pZiAobm9kZSA9PSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsKSB7Y29udGludWV9XG4gICAgICAgICAgICBpZiAodGhpcy5pc0FuY2VzdG9yKG5vZGUsIHRoaXMuZWwpKSB7Y29udGludWV9XG5cbiAgICAgICAgICAgIGxldCBjbCA9IG5vZGUuY2xhc3NOYW1lXG4gICAgICAgICAgICBpZiAoY2wgPT09IFwiQ29tYmluZWRNZXNoXCIgfHwgY2wgPT09IFwic2NlbmUtcHJldmlldy1jYW1lcmFcIikge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgYyA9IG5vZGUuY29tcG9uZW50c1xuICAgICAgICAgICAgaWYgKGNbXCJ3YXlwb2ludFwiXSB8fCBjW1wic2t5Ym94XCJdIHx8IGNbXCJkaXJlY3Rpb25hbC1saWdodFwiXSB8fCBjW1wiYW1iaWVudC1saWdodFwiXSB8fCBjW1wiaGVtaXNwaGVyZS1saWdodFwiXSkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2ggPSBub2RlLmNoaWxkcmVuXG4gICAgICAgICAgICB2YXIgbmF2bWVzaCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChsZXQgaj0wOyBqIDwgY2gubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoY2hbal0uY29tcG9uZW50c1tcIm5hdm1lc2hcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgbmF2bWVzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuYXZtZXNoKSB7Y29udGludWV9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSwgZHluYW1pYzogZmFsc2UgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFsbCBvYmplY3RzIGFuZCBhdmF0YXIgc2hvdWxkIGJlIHNldCB1cCwgc28gbGV0cyBtYWtlIHN1cmUgYWxsIG9iamVjdHMgYXJlIGNvcnJlY3RseSBzaG93blxuICAgICAgICBzaG93SGlkZU9iamVjdHMoKVxuICAgIH0sXG5cbiAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5zaXplID09PSB0aGlzLnNpemUpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwXG4gICAgICAgICAgICB0aGlzLnNpemUgPSB0aGlzLnBhcnNlTm9kZU5hbWUodGhpcy5kYXRhLnNpemUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImVudmlyb25tZW50LXNjZW5lLWxvYWRlZFwiLCB0aGlzLnNjZW5lTG9hZGVkKTtcbiAgICB9LFxuXG4gICAgLy8gcGVyIGZyYW1lIHN0dWZmXG4gICAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICAgICAgLy8gc2l6ZSA9PSAwIGlzIHVzZWQgdG8gc2lnbmFsIFwiZG8gbm90aGluZ1wiXG4gICAgICAgIGlmICh0aGlzLnNpemUgPT0gMCkge3JldHVybn1cblxuICAgICAgICAvLyBzZWUgaWYgdGhlcmUgYXJlIG5ldyBhdmF0YXJzXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXTpub3QoW2F2YXRhci1yZWdpb24tZm9sbG93ZXJdKVwiKVxuICAgICAgICBub2Rlcy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vICBzZWUgaWYgdGhlcmUgYXJlIG5ldyBjYW1lcmEtdG9vbHMgb3IgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSksIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXTpub3QoW29iamVjdC1yZWdpb24tZm9sbG93ZXJdKVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuICAgIH0sXG4gIFxuICAgIC8vIG5ld1NjZW5lOiBmdW5jdGlvbihtb2RlbCkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudmlyb25tZW50IHNjZW5lIGxvYWRlZDogXCIsIG1vZGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRSb290RWxlbWVudDogZnVuY3Rpb24oeyBkZXRhaWw6IHsgZWwgfSB9KSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKFwiZW50aXR5IGFkZGVkIHRvIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gcm9vdDogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyBhZGRTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byBlbnZpcm9ubWVudCBzY2VuZTogXCIsIGVsKVxuICAgIC8vIH0sXG5cbiAgICAvLyByZW1vdmVTY2VuZUVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSByZW1vdmVkIGZyb20gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LCAgXG4gICAgXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKHNpemUpIHtcbiAgICAgICAgLy8gbm9kZXMgc2hvdWxkIGJlIG5hbWVkIGFueXRoaW5nIGF0IHRoZSBiZWdpbm5pbmcgd2l0aCBcbiAgICAgICAgLy8gIFwic2l6ZVwiIChhbiBpbnRlZ2VyIG51bWJlcilcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIHNldCB0aGUgaGlkZGVyIGNvbXBvbmVudCB0byBcbiAgICAgICAgLy8gdXNlIHRoYXQgc2l6ZSBpbiBtZXRlcnMgZm9yIHRoZSBxdWFkcmFudHNcbiAgICAgICAgdGhpcy5ub2RlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG5cbiAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy5ub2RlTmFtZS5tYXRjaCgvXyhbMC05XSopJC8pXG5cbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDIsIGZpcnN0IG1hdGNoIGlzIHRoZSBkaXIsXG4gICAgICAgIC8vIHNlY29uZCBpcyB0aGUgY29tcG9uZW50TmFtZSBuYW1lIG9yIG51bWJlclxuICAgICAgICBpZiAoIXBhcmFtcyB8fCBwYXJhbXMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudE5hbWUgbm90IGZvcm1hdHRlZCBjb3JyZWN0bHk6IFwiLCB0aGlzLm5vZGVOYW1lKVxuICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxldCBub2RlU2l6ZSA9IHBhcnNlSW50KHBhcmFtc1sxXSlcbiAgICAgICAgICAgIGlmICghbm9kZVNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2l6ZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbm9kZVNpemVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pIiwibGV0IERlZmF1bHRIb29rcyA9IHtcbiAgICB2ZXJ0ZXhIb29rczoge1xuICAgICAgICB1bmlmb3JtczogJ2luc2VydGJlZm9yZTojaW5jbHVkZSA8Y29tbW9uPlxcbicsXG4gICAgICAgIGZ1bmN0aW9uczogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxjbGlwcGluZ19wbGFuZXNfcGFyc192ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcHJlVHJhbnNmb3JtOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPGJlZ2luX3ZlcnRleD5cXG4nLFxuICAgICAgICBwb3N0VHJhbnNmb3JtOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPHByb2plY3RfdmVydGV4PlxcbicsXG4gICAgICAgIHByZU5vcm1hbDogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxiZWdpbm5vcm1hbF92ZXJ0ZXg+XFxuJ1xuICAgIH0sXG4gICAgZnJhZ21lbnRIb29rczoge1xuICAgICAgICB1bmlmb3JtczogJ2luc2VydGJlZm9yZTojaW5jbHVkZSA8Y29tbW9uPlxcbicsXG4gICAgICAgIGZ1bmN0aW9uczogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxjbGlwcGluZ19wbGFuZXNfcGFyc19mcmFnbWVudD5cXG4nLFxuICAgICAgICBwcmVGcmFnQ29sb3I6ICdpbnNlcnRiZWZvcmU6Z2xfRnJhZ0NvbG9yID0gdmVjNCggb3V0Z29pbmdMaWdodCwgZGlmZnVzZUNvbG9yLmEgKTtcXG4nLFxuICAgICAgICBwb3N0RnJhZ0NvbG9yOiAnaW5zZXJ0YWZ0ZXI6Z2xfRnJhZ0NvbG9yID0gdmVjNCggb3V0Z29pbmdMaWdodCwgZGlmZnVzZUNvbG9yLmEgKTtcXG4nLFxuICAgICAgICBwb3N0TWFwOiAnaW5zZXJ0YWZ0ZXI6I2luY2x1ZGUgPG1hcF9mcmFnbWVudD5cXG4nLFxuICAgICAgICByZXBsYWNlTWFwOiAncmVwbGFjZTojaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxcbidcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IERlZmF1bHRIb29rcyIsIi8vIGJhc2VkIG9uIGh0dHBzOi8vZ2l0aHViLmNvbS9qYW1pZW93ZW4vdGhyZWUtbWF0ZXJpYWwtbW9kaWZpZXJcblxuaW1wb3J0IGRlZmF1bHRIb29rcyBmcm9tICcuL2RlZmF1bHRIb29rcyc7XG5cbmludGVyZmFjZSBFeHRlbmRlZE1hdGVyaWFsIHtcbiAgICB1bmlmb3JtczogVW5pZm9ybXM7XG4gICAgdmVydGV4U2hhZGVyOiBzdHJpbmc7XG4gICAgZnJhZ21lbnRTaGFkZXI6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNoYWRlckV4dGVuc2lvbk9wdHMge1xuICAgIHVuaWZvcm1zOiB7IFt1bmlmb3JtOiBzdHJpbmddOiBhbnkgfTtcbiAgICB2ZXJ0ZXhTaGFkZXI6IHsgW3BhdHRlcm46IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGZyYWdtZW50U2hhZGVyOiB7IFtwYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBjbGFzc05hbWU/OiBzdHJpbmc7XG4gICAgcG9zdE1vZGlmeVZlcnRleFNoYWRlcj86IChzaGFkZXI6IHN0cmluZykgPT4gc3RyaW5nO1xuICAgIHBvc3RNb2RpZnlGcmFnbWVudFNoYWRlcj86IChzaGFkZXI6IHN0cmluZykgPT4gc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2hhZGVyRXh0ZW5zaW9uIGV4dGVuZHMgU2hhZGVyRXh0ZW5zaW9uT3B0cyB7XG4gICAgaW5pdChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKTogdm9pZDtcbiAgICB1cGRhdGVVbmlmb3Jtcyh0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpOiB2b2lkXG59XG5cbmNvbnN0IG1vZGlmeVNvdXJjZSA9ICggc291cmNlOiBzdHJpbmcsIGhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sIGhvb2tzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKT0+e1xuICAgIGxldCBtYXRjaDtcbiAgICBmb3IoIGxldCBrZXkgaW4gaG9va0RlZnMgKXtcbiAgICAgICAgaWYoIGhvb2tzW2tleV0gKXtcbiAgICAgICAgICAgIG1hdGNoID0gL2luc2VydChiZWZvcmUpOiguKil8aW5zZXJ0KGFmdGVyKTooLiopfChyZXBsYWNlKTooLiopLy5leGVjKCBob29rRGVmc1trZXldICk7XG5cbiAgICAgICAgICAgIGlmKCBtYXRjaCApe1xuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFsxXSApeyAvLyBiZWZvcmVcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID0gc291cmNlLnJlcGxhY2UoIG1hdGNoWzJdLCBob29rc1trZXldICsgJ1xcbicgKyBtYXRjaFsyXSApO1xuICAgICAgICAgICAgICAgIH1lbHNlXG4gICAgICAgICAgICAgICAgaWYoIG1hdGNoWzNdICl7IC8vIGFmdGVyXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFs0XSwgbWF0Y2hbNF0gKyAnXFxuJyArIGhvb2tzW2tleV0gKTtcbiAgICAgICAgICAgICAgICB9ZWxzZVxuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFs1XSApeyAvLyByZXBsYWNlXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFs2XSwgaG9va3Nba2V5XSApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzb3VyY2U7XG59XG5cbnR5cGUgVW5pZm9ybXMgPSB7XG4gICAgW2tleTogc3RyaW5nXTogYW55O1xufVxuXG4vLyBjb3BpZWQgZnJvbSB0aHJlZS5yZW5kZXJlcnMuc2hhZGVycy5Vbmlmb3JtVXRpbHMuanNcbmV4cG9ydCBmdW5jdGlvbiBjbG9uZVVuaWZvcm1zKCBzcmM6IFVuaWZvcm1zICk6IFVuaWZvcm1zIHtcblx0dmFyIGRzdDogVW5pZm9ybXMgPSB7fTtcblxuXHRmb3IgKCB2YXIgdSBpbiBzcmMgKSB7XG5cdFx0ZHN0WyB1IF0gPSB7fSA7XG5cdFx0Zm9yICggdmFyIHAgaW4gc3JjWyB1IF0gKSB7XG5cdFx0XHR2YXIgcHJvcGVydHkgPSBzcmNbIHUgXVsgcCBdO1xuXHRcdFx0aWYgKCBwcm9wZXJ0eSAmJiAoIHByb3BlcnR5LmlzQ29sb3IgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNNYXRyaXgzIHx8IHByb3BlcnR5LmlzTWF0cml4NCB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc1ZlY3RvcjIgfHwgcHJvcGVydHkuaXNWZWN0b3IzIHx8IHByb3BlcnR5LmlzVmVjdG9yNCB8fFxuXHRcdFx0XHRwcm9wZXJ0eS5pc1RleHR1cmUgKSApIHtcblx0XHRcdFx0ICAgIGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eS5jbG9uZSgpO1xuXHRcdFx0fSBlbHNlIGlmICggQXJyYXkuaXNBcnJheSggcHJvcGVydHkgKSApIHtcblx0XHRcdFx0ZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5LnNsaWNlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkc3RbIHUgXVsgcCBdID0gcHJvcGVydHk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkc3Q7XG59XG5cbnR5cGUgU3VwZXJDbGFzc1R5cGVzID0gdHlwZW9mIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwgfCB0eXBlb2YgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcblxudHlwZSBTdXBlckNsYXNzZXMgPSBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCB8IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsIHwgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCB8IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsIHwgVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcblxuaW50ZXJmYWNlIEV4dGVuc2lvbkRhdGEge1xuICAgIFNoYWRlckNsYXNzOiBTdXBlckNsYXNzVHlwZXM7XG4gICAgU2hhZGVyTGliOiBUSFJFRS5TaGFkZXI7XG4gICAgS2V5OiBzdHJpbmcsXG4gICAgQ291bnQ6IG51bWJlcixcbiAgICBNb2RpZmllZE5hbWUoKTogc3RyaW5nLFxuICAgIFR5cGVDaGVjazogc3RyaW5nXG59XG5cbmxldCBjbGFzc01hcDoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmc7fSA9IHtcbiAgICBNZXNoU3RhbmRhcmRNYXRlcmlhbDogXCJzdGFuZGFyZFwiLFxuICAgIE1lc2hCYXNpY01hdGVyaWFsOiBcImJhc2ljXCIsXG4gICAgTWVzaExhbWJlcnRNYXRlcmlhbDogXCJsYW1iZXJ0XCIsXG4gICAgTWVzaFBob25nTWF0ZXJpYWw6IFwicGhvbmdcIixcbiAgICBNZXNoRGVwdGhNYXRlcmlhbDogXCJkZXB0aFwiLFxuICAgIHN0YW5kYXJkOiBcInN0YW5kYXJkXCIsXG4gICAgYmFzaWM6IFwiYmFzaWNcIixcbiAgICBsYW1iZXJ0OiBcImxhbWJlcnRcIixcbiAgICBwaG9uZzogXCJwaG9uZ1wiLFxuICAgIGRlcHRoOiBcImRlcHRoXCJcbn1cblxubGV0IHNoYWRlck1hcDoge1tuYW1lOiBzdHJpbmddOiBFeHRlbnNpb25EYXRhO31cblxuY29uc3QgZ2V0U2hhZGVyRGVmID0gKCBjbGFzc09yU3RyaW5nOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcgKT0+e1xuXG4gICAgaWYoICFzaGFkZXJNYXAgKXtcblxuICAgICAgICBsZXQgY2xhc3Nlczoge1tuYW1lOiBzdHJpbmddOiBTdXBlckNsYXNzVHlwZXM7fSA9IHtcbiAgICAgICAgICAgIHN0YW5kYXJkOiBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCxcbiAgICAgICAgICAgIGJhc2ljOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCxcbiAgICAgICAgICAgIGxhbWJlcnQ6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwsXG4gICAgICAgICAgICBwaG9uZzogVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwsXG4gICAgICAgICAgICBkZXB0aDogVEhSRUUuTWVzaERlcHRoTWF0ZXJpYWxcbiAgICAgICAgfVxuXG4gICAgICAgIHNoYWRlck1hcCA9IHt9O1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBjbGFzc2VzICl7XG4gICAgICAgICAgICBzaGFkZXJNYXBbIGtleSBdID0ge1xuICAgICAgICAgICAgICAgIFNoYWRlckNsYXNzOiBjbGFzc2VzWyBrZXkgXSxcbiAgICAgICAgICAgICAgICBTaGFkZXJMaWI6IFRIUkVFLlNoYWRlckxpYlsga2V5IF0sXG4gICAgICAgICAgICAgICAgS2V5OiBrZXksXG4gICAgICAgICAgICAgICAgQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgTW9kaWZpZWROYW1lOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYE1vZGlmaWVkTWVzaCR7IHRoaXMuS2V5WzBdLnRvVXBwZXJDYXNlKCkgKyB0aGlzLktleS5zbGljZSgxKSB9TWF0ZXJpYWxfJHsgKyt0aGlzLkNvdW50IH1gO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgVHlwZUNoZWNrOiBgaXNNZXNoJHsga2V5WzBdLnRvVXBwZXJDYXNlKCkgKyBrZXkuc2xpY2UoMSkgfU1hdGVyaWFsYFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IHNoYWRlckRlZjogRXh0ZW5zaW9uRGF0YSB8IHVuZGVmaW5lZDtcblxuICAgIGlmICggdHlwZW9mIGNsYXNzT3JTdHJpbmcgPT09ICdmdW5jdGlvbicgKXtcbiAgICAgICAgZm9yKCBsZXQga2V5IGluIHNoYWRlck1hcCApe1xuICAgICAgICAgICAgaWYoIHNoYWRlck1hcFsga2V5IF0uU2hhZGVyQ2xhc3MgPT09IGNsYXNzT3JTdHJpbmcgKXtcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBzaGFkZXJNYXBbIGtleSBdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgY2xhc3NPclN0cmluZyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgbGV0IG1hcHBlZENsYXNzT3JTdHJpbmcgPSBjbGFzc01hcFsgY2xhc3NPclN0cmluZyBdXG4gICAgICAgIHNoYWRlckRlZiA9IHNoYWRlck1hcFsgbWFwcGVkQ2xhc3NPclN0cmluZyB8fCBjbGFzc09yU3RyaW5nIF07XG4gICAgfVxuXG4gICAgaWYoICFzaGFkZXJEZWYgKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnTm8gU2hhZGVyIGZvdW5kIHRvIG1vZGlmeS4uLicgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2hhZGVyRGVmO1xufVxuXG4vKipcbiAqIFRoZSBtYWluIE1hdGVyaWFsIE1vZG9maWVyXG4gKi9cbmNsYXNzIE1hdGVyaWFsTW9kaWZpZXIge1xuICAgIF92ZXJ0ZXhIb29rczoge1t2ZXJ0ZXhob29rOiBzdHJpbmddOiBzdHJpbmd9XG4gICAgX2ZyYWdtZW50SG9va3M6IHtbZnJhZ2VtZW50aG9vazogc3RyaW5nXTogc3RyaW5nfVxuXG4gICAgY29uc3RydWN0b3IoIHZlcnRleEhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30sIGZyYWdtZW50SG9va0RlZnM6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nfSApe1xuXG4gICAgICAgIHRoaXMuX3ZlcnRleEhvb2tzID0ge307XG4gICAgICAgIHRoaXMuX2ZyYWdtZW50SG9va3MgPSB7fTtcblxuICAgICAgICBpZiggdmVydGV4SG9va0RlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuZGVmaW5lVmVydGV4SG9va3MoIHZlcnRleEhvb2tEZWZzICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiggZnJhZ21lbnRIb29rRGVmcyApe1xuICAgICAgICAgICAgdGhpcy5kZWZpbmVGcmFnbWVudEhvb2tzKCBmcmFnbWVudEhvb2tEZWZzICk7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIG1vZGlmeSggc2hhZGVyOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcsIG9wdHM6IFNoYWRlckV4dGVuc2lvbk9wdHMgKTogRXh0ZW5kZWRNYXRlcmlhbCB7XG5cbiAgICAgICAgbGV0IGRlZiA9IGdldFNoYWRlckRlZiggc2hhZGVyICk7XG5cbiAgICAgICAgbGV0IHZlcnRleFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi52ZXJ0ZXhTaGFkZXIsIHRoaXMuX3ZlcnRleEhvb2tzLCBvcHRzLnZlcnRleFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgZnJhZ21lbnRTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIuZnJhZ21lbnRTaGFkZXIsIHRoaXMuX2ZyYWdtZW50SG9va3MsIG9wdHMuZnJhZ21lbnRTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIGRlZi5TaGFkZXJMaWIudW5pZm9ybXMsIG9wdHMudW5pZm9ybXMgfHwge30gKTtcblxuICAgICAgICByZXR1cm4geyB2ZXJ0ZXhTaGFkZXIsZnJhZ21lbnRTaGFkZXIsdW5pZm9ybXMgfTtcblxuICAgIH1cblxuICAgIGV4dGVuZCggc2hhZGVyOiBTdXBlckNsYXNzZXMgfCBzdHJpbmcsIG9wdHM6IFNoYWRlckV4dGVuc2lvbk9wdHMgKTogeyBuZXcoKTogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsIH0ge1xuXG4gICAgICAgIGxldCBkZWYgPSBnZXRTaGFkZXJEZWYoIHNoYWRlciApOyAvLyBBREpVU1QgVEhJUyBTSEFERVIgREVGIC0gT05MWSBERUZJTkUgT05DRSAtIEFORCBTVE9SRSBBIFVTRSBDT1VOVCBPTiBFWFRFTkRFRCBWRVJTSU9OUy5cblxuICAgICAgICBsZXQgdmVydGV4U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLnZlcnRleFNoYWRlciwgdGhpcy5fdmVydGV4SG9va3MsIG9wdHMudmVydGV4U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCBmcmFnbWVudFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi5mcmFnbWVudFNoYWRlciwgdGhpcy5fZnJhZ21lbnRIb29rcywgb3B0cy5mcmFnbWVudFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgZGVmLlNoYWRlckxpYi51bmlmb3Jtcywgb3B0cy51bmlmb3JtcyB8fCB7fSApO1xuXG4gICAgICAgIGxldCBDbGFzc05hbWUgPSBvcHRzLmNsYXNzTmFtZSB8fCBkZWYuTW9kaWZpZWROYW1lKCk7XG5cbiAgICAgICAgbGV0IGV4dGVuZE1hdGVyaWFsID0gbmV3IEZ1bmN0aW9uKCAnQmFzZUNsYXNzJywgJ3VuaWZvcm1zJywgJ3ZlcnRleFNoYWRlcicsICdmcmFnbWVudFNoYWRlcicsICdjbG9uZVVuaWZvcm1zJyxgXG5cbiAgICAgICAgICAgIGxldCBjbHMgPSBjbGFzcyAke0NsYXNzTmFtZX0gZXh0ZW5kcyBCYXNlQ2xhc3Mge1xuICAgICAgICAgICAgICAgIGNvbnN0cnVjdG9yKCBwYXJhbXMgKXtcbiAgICAgICAgICAgICAgICAgICAgc3VwZXIocGFyYW1zKVxuICAgIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1zID0gY2xvbmVVbmlmb3JtcyggdW5pZm9ybXMgKTtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0VmFsdWVzKCBwYXJhbXMgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICAgICAgY29weSggc291cmNlICl7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHN1cGVyLmNvcHkoc291cmNlICk7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKCB7fSwgc291cmNlLnVuaWZvcm1zICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICBcbiAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB2YXIgY2xzID0gZnVuY3Rpb24gJHtDbGFzc05hbWV9KCBwYXJhbXMgKXtcblxuICAgICAgICAgICAgLy8gICAgIC8vQmFzZUNsYXNzLnByb3RvdHlwZS5jb25zdHJ1Y3Rvci5jYWxsKCB0aGlzLCBwYXJhbXMgKTtcblxuICAgICAgICAgICAgLy8gICAgIHRoaXMudW5pZm9ybXMgPSBjbG9uZVVuaWZvcm1zKCB1bmlmb3JtcyApO1xuXG4gICAgICAgICAgICAvLyAgICAgdGhpcy52ZXJ0ZXhTaGFkZXIgPSB2ZXJ0ZXhTaGFkZXI7XG4gICAgICAgICAgICAvLyAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuXG4gICAgICAgICAgICAvLyAgICAgdGhpcy5zZXRWYWx1ZXMoIHBhcmFtcyApO1xuXG4gICAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAgIC8vIGNscy5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKCBCYXNlQ2xhc3MucHJvdG90eXBlICk7XG4gICAgICAgICAgICAvLyBjbHMucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY2xzO1xuICAgICAgICAgICAgLy8gY2xzLnByb3RvdHlwZS4keyBkZWYuVHlwZUNoZWNrIH0gPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBjbHMucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiggc291cmNlICl7XG5cbiAgICAgICAgICAgIC8vICAgICBCYXNlQ2xhc3MucHJvdG90eXBlLmNvcHkuY2FsbCggdGhpcywgc291cmNlICk7XG5cbiAgICAgICAgICAgIC8vICAgICB0aGlzLnVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIHNvdXJjZS51bmlmb3JtcyApO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgIC8vICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcblxuICAgICAgICAgICAgLy8gICAgIHJldHVybiB0aGlzO1xuXG4gICAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAgIHJldHVybiBjbHM7XG5cbiAgICAgICAgYCk7XG5cbiAgICAgICAgaWYoIG9wdHMucG9zdE1vZGlmeVZlcnRleFNoYWRlciApe1xuICAgICAgICAgICAgdmVydGV4U2hhZGVyID0gb3B0cy5wb3N0TW9kaWZ5VmVydGV4U2hhZGVyKCB2ZXJ0ZXhTaGFkZXIgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiggb3B0cy5wb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXIgKXtcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyID0gb3B0cy5wb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXIoIGZyYWdtZW50U2hhZGVyICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZXh0ZW5kTWF0ZXJpYWwoIGRlZi5TaGFkZXJDbGFzcywgdW5pZm9ybXMsIHZlcnRleFNoYWRlciwgZnJhZ21lbnRTaGFkZXIsIGNsb25lVW5pZm9ybXMgKTtcblxuICAgIH1cblxuICAgIGRlZmluZVZlcnRleEhvb2tzKCBkZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKXtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gZGVmcyApe1xuICAgICAgICAgICAgdGhpcy5fdmVydGV4SG9va3NbIGtleSBdID0gZGVmc1trZXldO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBkZWZpbmVGcmFnbWVudEhvb2tzKCBkZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZyB9ICkge1xuXG4gICAgICAgIGZvciggbGV0IGtleSBpbiBkZWZzICl7XG4gICAgICAgICAgICB0aGlzLl9mcmFnbWVudEhvb2tzWyBrZXkgXSA9IGRlZnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG59XG5cbmxldCBkZWZhdWx0TWF0ZXJpYWxNb2RpZmllciA9IG5ldyBNYXRlcmlhbE1vZGlmaWVyKCBkZWZhdWx0SG9va3MudmVydGV4SG9va3MsIGRlZmF1bHRIb29rcy5mcmFnbWVudEhvb2tzICk7XG5cbmV4cG9ydCB7IEV4dGVuZGVkTWF0ZXJpYWwsIE1hdGVyaWFsTW9kaWZpZXIsIFNoYWRlckV4dGVuc2lvbiwgU2hhZGVyRXh0ZW5zaW9uT3B0cywgZGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgIGFzIERlZmF1bHRNYXRlcmlhbE1vZGlmaWVyfSIsImV4cG9ydCBkZWZhdWx0IC8qIGdsc2wgKi9gXG4gICAgICAgIC8vIGFib3ZlIGhlcmUsIHRoZSB0ZXh0dXJlIGxvb2t1cCB3aWxsIGJlIGRvbmUsIHdoaWNoIHdlXG4gICAgICAgIC8vIGNhbiBkaXNhYmxlIGJ5IHJlbW92aW5nIHRoZSBtYXAgZnJvbSB0aGUgbWF0ZXJpYWxcbiAgICAgICAgLy8gYnV0IGlmIHdlIGxlYXZlIGl0LCB3ZSBjYW4gYWxzbyBjaG9vc2UgdGhlIGJsZW5kIHRoZSB0ZXh0dXJlXG4gICAgICAgIC8vIHdpdGggb3VyIHNoYWRlciBjcmVhdGVkIGNvbG9yLCBvciB1c2UgaXQgaW4gdGhlIHNoYWRlciBvclxuICAgICAgICAvLyB3aGF0ZXZlclxuICAgICAgICAvL1xuICAgICAgICAvLyB2ZWM0IHRleGVsQ29sb3IgPSB0ZXh0dXJlMkQoIG1hcCwgdlV2ICk7XG4gICAgICAgIC8vIHRleGVsQ29sb3IgPSBtYXBUZXhlbFRvTGluZWFyKCB0ZXhlbENvbG9yICk7XG4gICAgICAgIFxuICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICAgICAgICBcbiAgICAgICAgdmVjNCBzaGFkZXJDb2xvcjtcbiAgICAgICAgbWFpbkltYWdlKHNoYWRlckNvbG9yLCB1di54eSAqIGlSZXNvbHV0aW9uLnh5KTtcbiAgICAgICAgc2hhZGVyQ29sb3IgPSBtYXBUZXhlbFRvTGluZWFyKCBzaGFkZXJDb2xvciApO1xuXG4gICAgICAgIGRpZmZ1c2VDb2xvciAqPSBzaGFkZXJDb2xvcjtcbmA7XG4iLCJleHBvcnQgZGVmYXVsdCB7XG4gICAgaVRpbWU6IHsgdmFsdWU6IDAuMCB9LFxuICAgIGlSZXNvbHV0aW9uOiAgeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjMoNTEyLCA1MTIsIDEpIH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfVxufTsiLCJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxudW5pZm9ybSB2ZWMzIGlSZXNvbHV0aW9uO1xudW5pZm9ybSBmbG9hdCBpVGltZTtcbnVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG51bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xudW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuICBgO1xuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy9hNDQ4ZTM0YjgxMzZmYWU1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgYmF5ZXJJbWFnZSBmcm9tICcuLi9hc3NldHMvYmF5ZXIucG5nJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJheWVyVGV4OiBUSFJFRS5UZXh0dXJlO1xubG9hZGVyLmxvYWQoYmF5ZXJJbWFnZSwgKGJheWVyKSA9PiB7XG4gICAgYmF5ZXIubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYXllci5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJheWVyLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmF5ZXIud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYXllclRleCA9IGJheWVyXG59KVxuXG5sZXQgQmxlZXB5QmxvY2tzU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gIHVuaWZvcm1zOiB1bmlmb3JtcyxcblxuICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gIGZyYWdtZW50U2hhZGVyOiB7IFxuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgIC8vIEJ5IERhZWRlbHVzOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3VzZXIvRGFlZGVsdXNcbiAgICAgIC8vIGxpY2Vuc2U6IENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgI2RlZmluZSBUSU1FU0NBTEUgMC4yNSBcbiAgICAgICNkZWZpbmUgVElMRVMgOFxuICAgICAgI2RlZmluZSBDT0xPUiAwLjcsIDEuNiwgMi44XG5cbiAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbiAgICAgIHtcbiAgICAgICAgdmVjMiB1diA9IGZyYWdDb29yZC54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICB1di54ICo9IGlSZXNvbHV0aW9uLnggLyBpUmVzb2x1dGlvbi55O1xuICAgICAgICBcbiAgICAgICAgdmVjNCBub2lzZSA9IHRleHR1cmUyRChpQ2hhbm5lbDAsIGZsb29yKHV2ICogZmxvYXQoVElMRVMpKSAvIGZsb2F0KFRJTEVTKSk7XG4gICAgICAgIGZsb2F0IHAgPSAxLjAgLSBtb2Qobm9pc2UuciArIG5vaXNlLmcgKyBub2lzZS5iICsgaVRpbWUgKiBmbG9hdChUSU1FU0NBTEUpLCAxLjApO1xuICAgICAgICBwID0gbWluKG1heChwICogMy4wIC0gMS44LCAwLjEpLCAyLjApO1xuICAgICAgICBcbiAgICAgICAgdmVjMiByID0gbW9kKHV2ICogZmxvYXQoVElMRVMpLCAxLjApO1xuICAgICAgICByID0gdmVjMihwb3coci54IC0gMC41LCAyLjApLCBwb3coci55IC0gMC41LCAyLjApKTtcbiAgICAgICAgcCAqPSAxLjAgLSBwb3cobWluKDEuMCwgMTIuMCAqIGRvdChyLCByKSksIDIuMCk7XG4gICAgICAgIFxuICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KENPTE9SLCAxLjApICogcDtcbiAgICAgIH1cbiAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IGJheWVyVGV4XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IGJheWVyVGV4XG4gICAgfVxuXG59XG5leHBvcnQgeyBCbGVlcHlCbG9ja3NTaGFkZXIgfVxuIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vdGhyZWVqc2Z1bmRhbWVudGFscy5vcmcvdGhyZWVqcy9sZXNzb25zL3RocmVlanMtc2hhZGVydG95Lmh0bWxcbi8vIHdoaWNoIGluIHR1cm4gaXMgZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTXNYU3pNXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBOb2lzZVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgI2RlZmluZSBuUEkgMy4xNDE1OTI2NTM1ODk3OTMyXG5cbiAgICAgICAgbWF0MiBuX3JvdGF0ZTJkKGZsb2F0IGFuZ2xlKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWF0Mihjb3MoYW5nbGUpLC1zaW4oYW5nbGUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbihhbmdsZSksIGNvcyhhbmdsZSkpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBuX3N0cmlwZShmbG9hdCBudW1iZXIpIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBtb2QgPSBtb2QobnVtYmVyLCAyLjApO1xuICAgICAgICAgICAgICAgIC8vcmV0dXJuIHN0ZXAoMC41LCBtb2QpKnN0ZXAoMS41LCBtb2QpO1xuICAgICAgICAgICAgICAgIC8vcmV0dXJuIG1vZC0xLjA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1pbigxLjAsIChzbW9vdGhzdGVwKDAuMCwgMC41LCBtb2QpIC0gc21vb3Roc3RlcCgwLjUsIDEuMCwgbW9kKSkqMS4wKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKSB7XG4gICAgICAgICAgICAgICAgdmVjMiB1X3Jlc29sdXRpb24gPSBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgICAgICBmbG9hdCB1X3RpbWUgPSBpVGltZTtcbiAgICAgICAgICAgICAgICB2ZWMzIGNvbG9yO1xuICAgICAgICAgICAgICAgIHZlYzIgc3QgPSBmcmFnQ29vcmQueHk7XG4gICAgICAgICAgICAgICAgc3QgKz0gMjAwMC4wICsgOTk4MDAwLjAqc3RlcCgxLjc1LCAxLjAtc2luKHVfdGltZS84LjApKTtcbiAgICAgICAgICAgICAgICBzdCArPSB1X3RpbWUvMjAwMC4wO1xuICAgICAgICAgICAgICAgIGZsb2F0IG0gPSAoMS4wKzkuMCpzdGVwKDEuMCwgMS4wLXNpbih1X3RpbWUvOC4wKSkpLygxLjArOS4wKnN0ZXAoMS4wLCAxLjAtc2luKHVfdGltZS8xNi4wKSkpO1xuICAgICAgICAgICAgICAgIHZlYzIgc3QxID0gc3QgKiAoNDAwLjAgKyAxMjAwLjAqc3RlcCgxLjc1LCAxLjArc2luKHVfdGltZSkpIC0gMzAwLjAqc3RlcCgxLjUsIDEuMCtzaW4odV90aW1lLzMuMCkpKTtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoc2luKHN0MS54KSpzaW4oc3QxLnkpLyhtKjEwMC4wK3VfdGltZS8xMDAuMCkpICogc3Q7XG4gICAgICAgICAgICAgICAgdmVjMiBzdDIgPSBzdCAqICgxMDAuMCArIDE5MDAuMCpzdGVwKDEuNzUsIDEuMC1zaW4odV90aW1lLzIuMCkpKTtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoY29zKHN0Mi54KSpjb3Moc3QyLnkpLyhtKjEwMC4wK3VfdGltZS8xMDAuMCkpICogc3Q7XG4gICAgICAgICAgICAgICAgc3QgPSBuX3JvdGF0ZTJkKDAuNSpuUEkrKG5QSSowLjUqc3RlcCggMS4wLDEuMCsgc2luKHVfdGltZS8xLjApKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsoblBJKjAuMSpzdGVwKCAxLjAsMS4wKyBjb3ModV90aW1lLzIuMCkpKSt1X3RpbWUqMC4wMDAxKSAqIHN0O1xuICAgICAgICAgICAgICAgIHN0ICo9IDEwLjA7XG4gICAgICAgICAgICAgICAgc3QgLz0gdV9yZXNvbHV0aW9uO1xuICAgICAgICAgICAgICAgIGNvbG9yID0gdmVjMyhuX3N0cmlwZShzdC54KnVfcmVzb2x1dGlvbi54LzEwLjArdV90aW1lLzEwLjApKTtcbiAgICAgICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KGNvbG9yLCAxLjApO1xuICAgICAgICB9XG4gICAgICAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgTm9pc2VTaGFkZXIgfVxuIiwiLy8gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvWGRzQkRCXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmxldCBMaXF1aWRNYXJibGVTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiksXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAvLy8vIENPTE9SUyAvLy8vXG5cbiAgICAgIGNvbnN0IHZlYzMgT1JBTkdFID0gdmVjMygxLjAsIDAuNiwgMC4yKTtcbiAgICAgIGNvbnN0IHZlYzMgUElOSyAgID0gdmVjMygwLjcsIDAuMSwgMC40KTsgXG4gICAgICBjb25zdCB2ZWMzIEJMVUUgICA9IHZlYzMoMC4wLCAwLjIsIDAuOSk7IFxuICAgICAgY29uc3QgdmVjMyBCTEFDSyAgPSB2ZWMzKDAuMCwgMC4wLCAwLjIpO1xuICAgICAgXG4gICAgICAvLy8vLyBOT0lTRSAvLy8vL1xuICAgICAgXG4gICAgICBmbG9hdCBoYXNoKCBmbG9hdCBuICkge1xuICAgICAgICAgIC8vcmV0dXJuIGZyYWN0KHNpbihuKSo0Mzc1OC41NDUzMTIzKTsgICBcbiAgICAgICAgICByZXR1cm4gZnJhY3Qoc2luKG4pKjc1NzI4LjU0NTMxMjMpOyBcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICBmbG9hdCBub2lzZSggaW4gdmVjMiB4ICkge1xuICAgICAgICAgIHZlYzIgcCA9IGZsb29yKHgpO1xuICAgICAgICAgIHZlYzIgZiA9IGZyYWN0KHgpO1xuICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgZmxvYXQgbiA9IHAueCArIHAueSo1Ny4wO1xuICAgICAgICAgIHJldHVybiBtaXgobWl4KCBoYXNoKG4gKyAwLjApLCBoYXNoKG4gKyAxLjApLCBmLngpLCBtaXgoaGFzaChuICsgNTcuMCksIGhhc2gobiArIDU4LjApLCBmLngpLCBmLnkpO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLy8vLy8gRkJNIC8vLy8vLyBcbiAgICAgIFxuICAgICAgbWF0MiBtID0gbWF0MiggMC42LCAwLjYsIC0wLjYsIDAuOCk7XG4gICAgICBmbG9hdCBmYm0odmVjMiBwKXtcbiAgICAgICBcbiAgICAgICAgICBmbG9hdCBmID0gMC4wO1xuICAgICAgICAgIGYgKz0gMC41MDAwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDI7XG4gICAgICAgICAgZiArPSAwLjI1MDAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMztcbiAgICAgICAgICBmICs9IDAuMTI1MCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAxO1xuICAgICAgICAgIGYgKz0gMC4wNjI1ICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDQ7XG4gICAgICAgICAgZiAvPSAwLjkzNzU7XG4gICAgICAgICAgcmV0dXJuIGY7XG4gICAgICB9XG4gICAgICBcbiAgICAgIFxuICAgICAgdm9pZCBtYWluSW1hZ2Uob3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCl7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gcGl4ZWwgcmF0aW9cbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgOyAgXG4gICAgICAgICAgdmVjMiBwID0gLSAxLiArIDIuICogdXY7XG4gICAgICAgICAgcC54ICo9IGlSZXNvbHV0aW9uLnggLyBpUmVzb2x1dGlvbi55O1xuICAgICAgICAgICBcbiAgICAgICAgICAvLyBkb21haW5zXG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgciA9IHNxcnQoZG90KHAscCkpOyBcbiAgICAgICAgICBmbG9hdCBhID0gY29zKHAueSAqIHAueCk7ICBcbiAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgLy8gZGlzdG9ydGlvblxuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IGYgPSBmYm0oIDUuMCAqIHApO1xuICAgICAgICAgIGEgKz0gZmJtKHZlYzIoMS45IC0gcC54LCAwLjkgKiBpVGltZSArIHAueSkpO1xuICAgICAgICAgIGEgKz0gZmJtKDAuNCAqIHApO1xuICAgICAgICAgIHIgKz0gZmJtKDIuOSAqIHApO1xuICAgICAgICAgICAgIFxuICAgICAgICAgIC8vIGNvbG9yaXplXG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMyBjb2wgPSBCTFVFO1xuICAgICAgICAgIFxuICAgICAgICAgIGZsb2F0IGZmID0gMS4wIC0gc21vb3Roc3RlcCgtMC40LCAxLjEsIG5vaXNlKHZlYzIoMC41ICogYSwgMy4zICogYSkpICk7ICAgICAgICBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIE9SQU5HRSwgZmYpO1xuICAgICAgICAgICAgIFxuICAgICAgICAgIGZmID0gMS4wIC0gc21vb3Roc3RlcCguMCwgMi44LCByICk7XG4gICAgICAgICAgY29sICs9ICBtaXgoIGNvbCwgQkxBQ0ssICBmZik7XG4gICAgICAgICAgXG4gICAgICAgICAgZmYgLT0gMS4wIC0gc21vb3Roc3RlcCgwLjMsIDAuNSwgZmJtKHZlYzIoMS4wLCA0MC4wICogYSkpICk7IFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgUElOSywgIGZmKTsgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKDIuLCAyLjksIGEgKiAxLjUgKTsgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBCTEFDSywgIGZmKTsgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoY29sLCAxLik7XG4gICAgICB9XG4gICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKG1hdC5tYXAub2Zmc2V0LngrIE1hdGgucmFuZG9tKCksIG1hdC5tYXAub2Zmc2V0LngrIE1hdGgucmFuZG9tKCkpIH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgfVxufVxuXG5leHBvcnQgeyBMaXF1aWRNYXJibGVTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy9jZWNlZmI1MGU0MDhkMTA1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc2xHV05cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBHYWxheHlTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvL0NCU1xuICAgICAgICAvL1BhcmFsbGF4IHNjcm9sbGluZyBmcmFjdGFsIGdhbGF4eS5cbiAgICAgICAgLy9JbnNwaXJlZCBieSBKb3NoUCdzIFNpbXBsaWNpdHkgc2hhZGVyOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvbHNsR1dyXG4gICAgICAgIFxuICAgICAgICAvLyBodHRwOi8vd3d3LmZyYWN0YWxmb3J1bXMuY29tL25ldy10aGVvcmllcy1hbmQtcmVzZWFyY2gvdmVyeS1zaW1wbGUtZm9ybXVsYS1mb3ItZnJhY3RhbC1wYXR0ZXJucy9cbiAgICAgICAgZmxvYXQgZmllbGQoaW4gdmVjMyBwLGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMjY7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExlc3MgaXRlcmF0aW9ucyBmb3Igc2Vjb25kIGxheWVyXG4gICAgICAgIGZsb2F0IGZpZWxkMihpbiB2ZWMzIHAsIGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMTg7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbnJhbmQzKCB2ZWMyIGNvIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBhID0gZnJhY3QoIGNvcyggY28ueCo4LjNlLTMgKyBjby55ICkqdmVjMygxLjNlNSwgNC43ZTUsIDIuOWU1KSApO1xuICAgICAgICAgICAgdmVjMyBiID0gZnJhY3QoIHNpbiggY28ueCowLjNlLTMgKyBjby55ICkqdmVjMyg4LjFlNSwgMS4wZTUsIDAuMWU1KSApO1xuICAgICAgICAgICAgdmVjMyBjID0gbWl4KGEsIGIsIDAuNSk7XG4gICAgICAgICAgICByZXR1cm4gYztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkICkge1xuICAgICAgICAgICAgdmVjMiB1diA9IDIuICogZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgLSAxLjtcbiAgICAgICAgICAgIHZlYzIgdXZzID0gdXYgKiBpUmVzb2x1dGlvbi54eSAvIG1heChpUmVzb2x1dGlvbi54LCBpUmVzb2x1dGlvbi55KTtcbiAgICAgICAgICAgIHZlYzMgcCA9IHZlYzModXZzIC8gNC4sIDApICsgdmVjMygxLiwgLTEuMywgMC4pO1xuICAgICAgICAgICAgcCArPSAuMiAqIHZlYzMoc2luKGlUaW1lIC8gMTYuKSwgc2luKGlUaW1lIC8gMTIuKSwgIHNpbihpVGltZSAvIDEyOC4pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZnJlcXNbNF07XG4gICAgICAgICAgICAvL1NvdW5kXG4gICAgICAgICAgICBmcmVxc1swXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4wMSwgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzFdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjA3LCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbMl0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMTUsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1szXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4zMCwgMC4yNSApICkueDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gZmllbGQocCxmcmVxc1syXSk7XG4gICAgICAgICAgICBmbG9hdCB2ID0gKDEuIC0gZXhwKChhYnModXYueCkgLSAxLikgKiA2LikpICogKDEuIC0gZXhwKChhYnModXYueSkgLSAxLikgKiA2LikpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1NlY29uZCBMYXllclxuICAgICAgICAgICAgdmVjMyBwMiA9IHZlYzModXZzIC8gKDQuK3NpbihpVGltZSowLjExKSowLjIrMC4yK3NpbihpVGltZSowLjE1KSowLjMrMC40KSwgMS41KSArIHZlYzMoMi4sIC0xLjMsIC0xLik7XG4gICAgICAgICAgICBwMiArPSAwLjI1ICogdmVjMyhzaW4oaVRpbWUgLyAxNi4pLCBzaW4oaVRpbWUgLyAxMi4pLCAgc2luKGlUaW1lIC8gMTI4LikpO1xuICAgICAgICAgICAgZmxvYXQgdDIgPSBmaWVsZDIocDIsZnJlcXNbM10pO1xuICAgICAgICAgICAgdmVjNCBjMiA9IG1peCguNCwgMS4sIHYpICogdmVjNCgxLjMgKiB0MiAqIHQyICogdDIgLDEuOCAgKiB0MiAqIHQyICwgdDIqIGZyZXFzWzBdLCB0Mik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9MZXQncyBhZGQgc29tZSBzdGFyc1xuICAgICAgICAgICAgLy9UaGFua3MgdG8gaHR0cDovL2dsc2wuaGVyb2t1LmNvbS9lIzY5MDQuMFxuICAgICAgICAgICAgdmVjMiBzZWVkID0gcC54eSAqIDIuMDtcdFxuICAgICAgICAgICAgc2VlZCA9IGZsb29yKHNlZWQgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kID0gbnJhbmQzKCBzZWVkICk7XG4gICAgICAgICAgICB2ZWM0IHN0YXJjb2xvciA9IHZlYzQocG93KHJuZC55LDQwLjApKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9TZWNvbmQgTGF5ZXJcbiAgICAgICAgICAgIHZlYzIgc2VlZDIgPSBwMi54eSAqIDIuMDtcbiAgICAgICAgICAgIHNlZWQyID0gZmxvb3Ioc2VlZDIgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kMiA9IG5yYW5kMyggc2VlZDIgKTtcbiAgICAgICAgICAgIHN0YXJjb2xvciArPSB2ZWM0KHBvdyhybmQyLnksNDAuMCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSBtaXgoZnJlcXNbM10tLjMsIDEuLCB2KSAqIHZlYzQoMS41KmZyZXFzWzJdICogdCAqIHQqIHQgLCAxLjIqZnJlcXNbMV0gKiB0ICogdCwgZnJlcXNbM10qdCwgMS4wKStjMitzdGFyY29sb3I7XG4gICAgICAgIH1cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IEdhbGF4eVNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzRzR1N6Y1xuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcblxubGV0IExhY2VUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBDcmVhdGVkIGJ5IFN0ZXBoYW5lIEN1aWxsZXJkaWVyIC0gQWlla2ljay8yMDE1ICh0d2l0dGVyOkBhaWVraWNrKVxuICAgICAgICAvLyBMaWNlbnNlIENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgICAvLyBUdW5lZCB2aWEgWFNoYWRlIChodHRwOi8vd3d3LmZ1bnBhcmFkaWdtLmNvbS94c2hhZGUvKVxuICAgICAgICBcbiAgICAgICAgdmVjMiBsdF9tbyA9IHZlYzIoMCk7XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBsdF9wbiggaW4gdmVjMyB4ICkgLy8gaXEgbm9pc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcbiAgICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuICAgICAgICAgICAgdmVjMiByZyA9IHRleHR1cmUoaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIC0xMDAuMCApLnl4O1xuICAgICAgICAgICAgcmV0dXJuIC0xLjArMi40Km1peCggcmcueCwgcmcueSwgZi56ICk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzIgbHRfcGF0aChmbG9hdCB0KVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gdmVjMihjb3ModCowLjIpLCBzaW4odCowLjIpKSAqIDIuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXQzIGx0X214ID0gbWF0MygxLDAsMCwwLDcsMCwwLDAsNyk7XG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXkgPSBtYXQzKDcsMCwwLDAsMSwwLDAsMCw3KTtcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teiA9IG1hdDMoNywwLDAsMCw3LDAsMCwwLDEpO1xuICAgICAgICBcbiAgICAgICAgLy8gYmFzZSBvbiBzaGFuZSB0ZWNoIGluIHNoYWRlciA6IE9uZSBUd2VldCBDZWxsdWxhciBQYXR0ZXJuXG4gICAgICAgIGZsb2F0IGx0X2Z1bmModmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwID0gZnJhY3QocC82OC42KSAtIC41O1xuICAgICAgICAgICAgcmV0dXJuIG1pbihtaW4oYWJzKHAueCksIGFicyhwLnkpKSwgYWJzKHAueikpICsgMC4xO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X2VmZmVjdCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAgKj0gbHRfbXogKiBsdF9teCAqIGx0X215ICogc2luKHAuenh5KTsgLy8gc2luKHAuenh5KSBpcyBiYXNlZCBvbiBpcSB0ZWNoIGZyb20gc2hhZGVyIChTY3VscHR1cmUgSUlJKVxuICAgICAgICAgICAgcmV0dXJuIHZlYzMobWluKG1pbihsdF9mdW5jKHAqbHRfbXgpLCBsdF9mdW5jKHAqbHRfbXkpKSwgbHRfZnVuYyhwKmx0X216KSkvLjYpO1xuICAgICAgICB9XG4gICAgICAgIC8vXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2Rpc3BsYWNlbWVudCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgY29sID0gMS4tbHRfZWZmZWN0KHAqMC44KTtcbiAgICAgICAgICAgICAgIGNvbCA9IGNsYW1wKGNvbCwgLS41LCAxLik7XG4gICAgICAgICAgICBmbG9hdCBkaXN0ID0gZG90KGNvbCx2ZWMzKDAuMDIzKSk7XG4gICAgICAgICAgICBjb2wgPSBzdGVwKGNvbCwgdmVjMygwLjgyKSk7Ly8gYmxhY2sgbGluZSBvbiBzaGFwZVxuICAgICAgICAgICAgcmV0dXJuIHZlYzQoZGlzdCxjb2wpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X21hcCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAueHkgLT0gbHRfcGF0aChwLnopO1xuICAgICAgICAgICAgdmVjNCBkaXNwID0gbHRfZGlzcGxhY2VtZW50KHNpbihwLnp4eSoyLikqMC44KTtcbiAgICAgICAgICAgIHAgKz0gc2luKHAuenh5Ki41KSoxLjU7XG4gICAgICAgICAgICBmbG9hdCBsID0gbGVuZ3RoKHAueHkpIC0gNC47XG4gICAgICAgICAgICByZXR1cm4gdmVjNChtYXgoLWwgKyAwLjA5LCBsKSAtIGRpc3AueCwgZGlzcC55encpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X25vciggaW4gdmVjMyBwb3MsIGZsb2F0IHByZWMgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGVwcyA9IHZlYzMoIHByZWMsIDAuLCAwLiApO1xuICAgICAgICAgICAgdmVjMyBsdF9ub3IgPSB2ZWMzKFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnh5eSkueCAtIGx0X21hcChwb3MtZXBzLnh5eSkueCxcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy55eHkpLnggLSBsdF9tYXAocG9zLWVwcy55eHkpLngsXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueXl4KS54IC0gbHRfbWFwKHBvcy1lcHMueXl4KS54ICk7XG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXplKGx0X25vcik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2xpZ2h0KHZlYzMgcm8sIHZlYzMgcmQsIGZsb2F0IGQsIHZlYzMgbGlnaHRwb3MsIHZlYzMgbGMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgcCA9IHJvICsgcmQgKiBkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBvcmlnaW5hbCBub3JtYWxlXG4gICAgICAgICAgICB2ZWMzIG4gPSBsdF9ub3IocCwgMC4xKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBsaWdodGRpciA9IGxpZ2h0cG9zIC0gcDtcbiAgICAgICAgICAgIGZsb2F0IGxpZ2h0bGVuID0gbGVuZ3RoKGxpZ2h0cG9zIC0gcCk7XG4gICAgICAgICAgICBsaWdodGRpciAvPSBsaWdodGxlbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYW1iID0gMC42O1xuICAgICAgICAgICAgZmxvYXQgZGlmZiA9IGNsYW1wKCBkb3QoIG4sIGxpZ2h0ZGlyICksIDAuMCwgMS4wICk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGJyZGYgPSB2ZWMzKDApO1xuICAgICAgICAgICAgYnJkZiArPSBhbWIgKiB2ZWMzKDAuMiwwLjUsMC4zKTsgLy8gY29sb3IgbWF0XG4gICAgICAgICAgICBicmRmICs9IGRpZmYgKiAwLjY7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZGYgPSBtaXgoYnJkZiwgbHRfbWFwKHApLnl6dywgMC41KTsvLyBtZXJnZSBsaWdodCBhbmQgYmxhY2sgbGluZSBwYXR0ZXJuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmVjNChicmRmLCBsaWdodGxlbik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfc3RhcnModmVjMiB1diwgdmVjMyByZCwgZmxvYXQgZCwgdmVjMiBzLCB2ZWMyIGcpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHV2ICo9IDgwMC4gKiBzLngvcy55O1xuICAgICAgICAgICAgZmxvYXQgayA9IGZyYWN0KCBjb3ModXYueSAqIDAuMDAwMSArIHV2LngpICogOTAwMDAuKTtcbiAgICAgICAgICAgIGZsb2F0IHZhciA9IHNpbihsdF9wbihkKjAuNityZCoxODIuMTQpKSowLjUrMC41Oy8vIHRoYW5rIHRvIGtsZW1zIGZvciB0aGUgdmFyaWF0aW9uIGluIG15IHNoYWRlciBzdWJsdW1pbmljXG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHZlYzMobWl4KDAuLCAxLiwgdmFyKnBvdyhrLCAyMDAuKSkpOy8vIGNvbWUgZnJvbSBDQlMgU2hhZGVyIFwiU2ltcGxpY2l0eVwiIDogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zbEdXTlxuICAgICAgICAgICAgcmV0dXJuIGNvbDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8vLy8vLy9NQUlOLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgcyA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgdmVjMiBnID0gZnJhZ0Nvb3JkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdGltZSA9IGlUaW1lKjEuMDtcbiAgICAgICAgICAgIGZsb2F0IGNhbV9hID0gdGltZTsgLy8gYW5nbGUgelxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBjYW1fZSA9IDMuMjsgLy8gZWxldmF0aW9uXG4gICAgICAgICAgICBmbG9hdCBjYW1fZCA9IDQuOyAvLyBkaXN0YW5jZSB0byBvcmlnaW4gYXhpc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBtYXhkID0gNDAuOyAvLyByYXkgbWFyY2hpbmcgZGlzdGFuY2UgbWF4XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgdXYgPSAoZyoyLi1zKS9zLnk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY29sID0gdmVjMygwLik7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBybyA9IHZlYzMobHRfcGF0aCh0aW1lKStsdF9tbyx0aW1lKTtcbiAgICAgICAgICAgICAgdmVjMyBjdiA9IHZlYzMobHRfcGF0aCh0aW1lKzAuMSkrbHRfbW8sdGltZSswLjEpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1PXZlYzMoMCwxLDApO1xuICAgICAgICAgICAgICB2ZWMzIHJvdiA9IG5vcm1hbGl6ZShjdi1ybyk7XG4gICAgICAgICAgICB2ZWMzIHUgPSBub3JtYWxpemUoY3Jvc3MoY3Uscm92KSk7XG4gICAgICAgICAgICAgIHZlYzMgdiA9IGNyb3NzKHJvdix1KTtcbiAgICAgICAgICAgICAgdmVjMyByZCA9IG5vcm1hbGl6ZShyb3YgKyB1di54KnUgKyB1di55KnYpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1cnZlMCA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMSA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMiA9IHZlYzMoMCk7XG4gICAgICAgICAgICBmbG9hdCBvdXRTdGVwID0gMC47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGFvID0gMC47IC8vIGFvIGxvdyBjb3N0IDopXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHN0ID0gMC47XG4gICAgICAgICAgICBmbG9hdCBkID0gMC47XG4gICAgICAgICAgICBmb3IoaW50IGk9MDtpPDI1MDtpKyspXG4gICAgICAgICAgICB7ICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHN0PDAuMDI1KmxvZyhkKmQvc3QvMWU1KXx8ZD5tYXhkKSBicmVhazsvLyBzcGVjaWFsIGJyZWFrIGNvbmRpdGlvbiBmb3IgbG93IHRoaWNrbmVzcyBvYmplY3RcbiAgICAgICAgICAgICAgICBzdCA9IGx0X21hcChybytyZCpkKS54O1xuICAgICAgICAgICAgICAgIGQgKz0gc3QgKiAwLjY7IC8vIHRoZSAwLjYgaXMgc2VsZWN0ZWQgYWNjb3JkaW5nIHRvIHRoZSAxZTUgYW5kIHRoZSAwLjAyNSBvZiB0aGUgYnJlYWsgY29uZGl0aW9uIGZvciBnb29kIHJlc3VsdFxuICAgICAgICAgICAgICAgIGFvKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkIDwgbWF4ZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWM0IGxpID0gbHRfbGlnaHQocm8sIHJkLCBkLCBybywgdmVjMygwKSk7Ly8gcG9pbnQgbGlnaHQgb24gdGhlIGNhbVxuICAgICAgICAgICAgICAgIGNvbCA9IGxpLnh5ei8obGkudyowLjIpOy8vIGNoZWFwIGxpZ2h0IGF0dGVudWF0aW9uXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgY29sID0gbWl4KHZlYzMoMS4tYW8vMTAwLiksIGNvbCwgMC41KTsvLyBsb3cgY29zdCBhbyA6KVxuICAgICAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgPSBtaXgoIGNvbCwgdmVjMygwKSwgMS4wLWV4cCggLTAuMDAzKmQqZCApICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBmcmFnQ29sb3IucmdiID0gbHRfc3RhcnModXYsIHJkLCBkLCBzLCBmcmFnQ29vcmQpOy8vIHN0YXJzIGJnXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHZpZ25ldHRlXG4gICAgICAgICAgICB2ZWMyIHEgPSBmcmFnQ29vcmQvcztcbiAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgKj0gMC41ICsgMC41KnBvdyggMTYuMCpxLngqcS55KigxLjAtcS54KSooMS4wLXEueSksIDAuMjUgKTsgLy8gaXEgdmlnbmV0dGVcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9sY2FnbWFjLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvZjI3ZTAxMDQ2MDVmMGNkNy5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvTWRmR1JYXG5cbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvbm9pc2UtMjU2LnBuZydcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIGlDaGFubmVsUmVzb2x1dGlvbjogeyB2YWx1ZTogWyBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSldIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxuICAgIGNvbnNvbGUubG9nKCBcIm5vaXNlIHRleHR1cmUgc2l6ZTogXCIsIG5vaXNlLmltYWdlLndpZHRoLG5vaXNlLmltYWdlLmhlaWdodCApO1xufSlcblxubGV0IEZpcmVUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgIHVuaWZvcm0gdmVjMyBpQ2hhbm5lbFJlc29sdXRpb25bNF07XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gQ3JlYXRlZCBieSBpbmlnbyBxdWlsZXogLSBpcS8yMDEzXG4vLyBJIHNoYXJlIHRoaXMgcGllY2UgKGFydCBhbmQgY29kZSkgaGVyZSBpbiBTaGFkZXJ0b3kgYW5kIHRocm91Z2ggaXRzIFB1YmxpYyBBUEksIG9ubHkgZm9yIGVkdWNhdGlvbmFsIHB1cnBvc2VzLiBcbi8vIFlvdSBjYW5ub3QgdXNlLCBzZWxsLCBzaGFyZSBvciBob3N0IHRoaXMgcGllY2Ugb3IgbW9kaWZpY2F0aW9ucyBvZiBpdCBhcyBwYXJ0IG9mIHlvdXIgb3duIGNvbW1lcmNpYWwgb3Igbm9uLWNvbW1lcmNpYWwgcHJvZHVjdCwgd2Vic2l0ZSBvciBwcm9qZWN0LlxuLy8gWW91IGNhbiBzaGFyZSBhIGxpbmsgdG8gaXQgb3IgYW4gdW5tb2RpZmllZCBzY3JlZW5zaG90IG9mIGl0IHByb3ZpZGVkIHlvdSBhdHRyaWJ1dGUgXCJieSBJbmlnbyBRdWlsZXosIEBpcXVpbGV6bGVzIGFuZCBpcXVpbGV6bGVzLm9yZ1wiLiBcbi8vIElmIHlvdSBhcmUgYSB0ZWNoZXIsIGxlY3R1cmVyLCBlZHVjYXRvciBvciBzaW1pbGFyIGFuZCB0aGVzZSBjb25kaXRpb25zIGFyZSB0b28gcmVzdHJpY3RpdmUgZm9yIHlvdXIgbmVlZHMsIHBsZWFzZSBjb250YWN0IG1lIGFuZCB3ZSdsbCB3b3JrIGl0IG91dC5cblxuZmxvYXQgZmlyZV9ub2lzZSggaW4gdmVjMyB4IClcbntcbiAgICB2ZWMzIHAgPSBmbG9vcih4KTtcbiAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcblx0ZiA9IGYqZiooMy4wLTIuMCpmKTtcblx0XG5cdHZlYzIgdXYgPSAocC54eSt2ZWMyKDM3LjAsMTcuMCkqcC56KSArIGYueHk7XG5cdHZlYzIgcmcgPSB0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsICh1disgMC41KS8yNTYuMCwgMC4wICkueXg7XG5cdHJldHVybiBtaXgoIHJnLngsIHJnLnksIGYueiApO1xufVxuXG52ZWM0IGZpcmVfbWFwKCB2ZWMzIHAgKVxue1xuXHRmbG9hdCBkZW4gPSAwLjIgLSBwLnk7XG5cbiAgICAvLyBpbnZlcnQgc3BhY2VcdFxuXHRwID0gLTcuMCpwL2RvdChwLHApO1xuXG4gICAgLy8gdHdpc3Qgc3BhY2VcdFxuXHRmbG9hdCBjbyA9IGNvcyhkZW4gLSAwLjI1KmlUaW1lKTtcblx0ZmxvYXQgc2kgPSBzaW4oZGVuIC0gMC4yNSppVGltZSk7XG5cdHAueHogPSBtYXQyKGNvLC1zaSxzaSxjbykqcC54ejtcblxuICAgIC8vIHNtb2tlXHRcblx0ZmxvYXQgZjtcblx0dmVjMyBxID0gcCAgICAgICAgICAgICAgICAgICAgICAgICAgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTs7XG4gICAgZiAgPSAwLjUwMDAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMiAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4yNTAwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDMgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMTI1MDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAxIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjA2MjUwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMiAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4wMzEyNSpmaXJlX25vaXNlKCBxICk7XG5cblx0ZGVuID0gY2xhbXAoIGRlbiArIDQuMCpmLCAwLjAsIDEuMCApO1xuXHRcblx0dmVjMyBjb2wgPSBtaXgoIHZlYzMoMS4wLDAuOSwwLjgpLCB2ZWMzKDAuNCwwLjE1LDAuMSksIGRlbiApICsgMC4wNSpzaW4ocCk7XG5cdFxuXHRyZXR1cm4gdmVjNCggY29sLCBkZW4gKTtcbn1cblxudmVjMyByYXltYXJjaCggaW4gdmVjMyBybywgaW4gdmVjMyByZCwgaW4gdmVjMiBwaXhlbCApXG57XG5cdHZlYzQgc3VtID0gdmVjNCggMC4wICk7XG5cblx0ZmxvYXQgdCA9IDAuMDtcblxuICAgIC8vIGRpdGhlcmluZ1x0XG5cdHQgKz0gMC4wNSp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIHBpeGVsLnh5L2lDaGFubmVsUmVzb2x1dGlvblswXS54LCAwLjAgKS54O1xuXHRcblx0Zm9yKCBpbnQgaT0wOyBpPDEwMDsgaSsrIClcblx0e1xuXHRcdGlmKCBzdW0uYSA+IDAuOTkgKSBicmVhaztcblx0XHRcblx0XHR2ZWMzIHBvcyA9IHJvICsgdCpyZDtcblx0XHR2ZWM0IGNvbCA9IGZpcmVfbWFwKCBwb3MgKTtcblx0XHRcblx0XHRjb2wueHl6ICo9IG1peCggMy4xKnZlYzMoMS4wLDAuNSwwLjA1KSwgdmVjMygwLjQ4LDAuNTMsMC41KSwgY2xhbXAoIChwb3MueS0wLjIpLzIuMCwgMC4wLCAxLjAgKSApO1xuXHRcdFxuXHRcdGNvbC5hICo9IDAuNjtcblx0XHRjb2wucmdiICo9IGNvbC5hO1xuXG5cdFx0c3VtID0gc3VtICsgY29sKigxLjAgLSBzdW0uYSk7XHRcblxuXHRcdHQgKz0gMC4wNTtcblx0fVxuXG5cdHJldHVybiBjbGFtcCggc3VtLnh5eiwgMC4wLCAxLjAgKTtcbn1cblxudm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxue1xuXHR2ZWMyIHEgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICB2ZWMyIHAgPSAtMS4wICsgMi4wKnE7XG4gICAgcC54ICo9IGlSZXNvbHV0aW9uLngvIGlSZXNvbHV0aW9uLnk7XG5cdFxuICAgIHZlYzIgbW8gPSB2ZWMyKDAuNSwwLjUpOyAvL2lNb3VzZS54eSAvIGlSZXNvbHV0aW9uLnh5O1xuICAgIC8vaWYoIGlNb3VzZS53PD0wLjAwMDAxICkgbW89dmVjMigwLjApO1xuXHRcbiAgICAvLyBjYW1lcmFcbiAgICB2ZWMzIHJvID0gNC4wKm5vcm1hbGl6ZSh2ZWMzKGNvcygzLjAqbW8ueCksIDEuNCAtIDEuMCoobW8ueS0uMSksIHNpbigzLjAqbW8ueCkpKTtcblx0dmVjMyB0YSA9IHZlYzMoMC4wLCAxLjAsIDAuMCk7XG5cdGZsb2F0IGNyID0gMC41KmNvcygwLjcqaVRpbWUpO1xuXHRcbiAgICAvLyBzaGFrZVx0XHRcblx0cm8gKz0gMC4xKigtMS4wKzIuMCp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIGlUaW1lKnZlYzIoMC4wMTAsMC4wMTQpLCAwLjAgKS54eXopO1xuXHR0YSArPSAwLjEqKC0xLjArMi4wKnRleHR1cmVMb2QoIGlDaGFubmVsMCwgaVRpbWUqdmVjMigwLjAxMywwLjAwOCksIDAuMCApLnh5eik7XG5cdFxuXHQvLyBidWlsZCByYXlcbiAgICB2ZWMzIHd3ID0gbm9ybWFsaXplKCB0YSAtIHJvKTtcbiAgICB2ZWMzIHV1ID0gbm9ybWFsaXplKGNyb3NzKCB2ZWMzKHNpbihjciksY29zKGNyKSwwLjApLCB3dyApKTtcbiAgICB2ZWMzIHZ2ID0gbm9ybWFsaXplKGNyb3NzKHd3LHV1KSk7XG4gICAgdmVjMyByZCA9IG5vcm1hbGl6ZSggcC54KnV1ICsgcC55KnZ2ICsgMi4wKnd3ICk7XG5cdFxuICAgIC8vIHJheW1hcmNoXHRcblx0dmVjMyBjb2wgPSByYXltYXJjaCggcm8sIHJkLCBmcmFnQ29vcmQgKTtcblx0XG5cdC8vIGNvbnRyYXN0IGFuZCB2aWduZXR0aW5nXHRcblx0Y29sID0gY29sKjAuNSArIDAuNSpjb2wqY29sKigzLjAtMi4wKmNvbCk7XG5cdGNvbCAqPSAwLjI1ICsgMC43NSpwb3coIDE2LjAqcS54KnEueSooMS4wLXEueCkqKDEuMC1xLnkpLCAwLjEgKTtcblx0XG4gICAgZnJhZ0NvbG9yID0gdmVjNCggY29sLCAxLjAgKTtcbn1cblxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbFJlc29sdXRpb24udmFsdWVbMF0ueCA9IG5vaXNlVGV4LmltYWdlLndpZHRoXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsUmVzb2x1dGlvbi52YWx1ZVswXS55ID0gbm9pc2VUZXguaW1hZ2UuaGVpZ2h0XG4gICAgfVxufVxuXG5leHBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH1cbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvN2xmWFJCXG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBNaXN0U2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuXG4gICAgICAgIGZsb2F0IG1yYW5kKHZlYzIgY29vcmRzKVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gZnJhY3Qoc2luKGRvdChjb29yZHMsIHZlYzIoNTYuMzQ1Niw3OC4zNDU2KSkgKiA1LjApICogMTAwMDAuMCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1ub2lzZSh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMiBpID0gZmxvb3IoY29vcmRzKTtcbiAgICAgICAgICAgIHZlYzIgZiA9IGZyYWN0KGNvb3Jkcyk7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYSA9IG1yYW5kKGkpO1xuICAgICAgICAgICAgZmxvYXQgYiA9IG1yYW5kKGkgKyB2ZWMyKDEuMCwgMC4wKSk7XG4gICAgICAgICAgICBmbG9hdCBjID0gbXJhbmQoaSArIHZlYzIoMC4wLCAxLjApKTtcbiAgICAgICAgICAgIGZsb2F0IGQgPSBtcmFuZChpICsgdmVjMigxLjAsIDEuMCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgY3ViaWMgPSBmICogZiAqICgzLjAgLSAyLjAgKiBmKTtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbWl4KGEsIGIsIGN1YmljLngpICsgKGMgLSBhKSAqIGN1YmljLnkgKiAoMS4wIC0gY3ViaWMueCkgKyAoZCAtIGIpICogY3ViaWMueCAqIGN1YmljLnk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IGZibSh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgZmxvYXQgdmFsdWUgPSAwLjA7XG4gICAgICAgICAgICBmbG9hdCBzY2FsZSA9IDAuNTtcbiAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IDEwOyBpKyspXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gbW5vaXNlKGNvb3JkcykgKiBzY2FsZTtcbiAgICAgICAgICAgICAgICBjb29yZHMgKj0gNC4wO1xuICAgICAgICAgICAgICAgIHNjYWxlICo9IDAuNTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi55ICogMi4wO1xuICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBmaW5hbCA9IDAuMDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9MTsgaSA8IDY7IGkrKylcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWMyIG1vdGlvbiA9IHZlYzIoZmJtKHV2ICsgdmVjMigwLjAsaVRpbWUpICogMC4wNSArIHZlYzIoaSwgMC4wKSkpO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBmaW5hbCArPSBmYm0odXYgKyBtb3Rpb24pO1xuICAgICAgICBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmluYWwgLz0gNS4wO1xuICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChtaXgodmVjMygtMC4zKSwgdmVjMygwLjQ1LCAwLjQsIDAuNikgKyB2ZWMzKDAuNiksIGZpbmFsKSwgMSk7XG4gICAgICAgIH1cbiAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSswLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxMikgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IE1pc3RTaGFkZXIgfVxuIiwiLy8gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvWGRzQkRCXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHN0YXRlID0ge1xuICAgIGFuaW1hdGU6IGZhbHNlLFxuICAgIG5vaXNlTW9kZTogJ3NjYWxlJyxcbiAgICBpbnZlcnQ6IGZhbHNlLFxuICAgIHNoYXJwZW46IHRydWUsXG4gICAgc2NhbGVCeVByZXY6IGZhbHNlLFxuICAgIGdhaW46IDAuNTQsXG4gICAgbGFjdW5hcml0eTogMi4wLFxuICAgIG9jdGF2ZXM6IDUsXG4gICAgc2NhbGUxOiAzLjAsXG4gICAgc2NhbGUyOiAzLjAsXG4gICAgdGltZVNjYWxlWDogMC40LFxuICAgIHRpbWVTY2FsZVk6IDAuMyxcbiAgICBjb2xvcjE6IFswLCAwLCAwXSxcbiAgICBjb2xvcjI6IFsxMzAsIDEyOSwxMjldLFxuICAgIGNvbG9yMzogWzExMCwgMTEwLCAxMTBdLFxuICAgIGNvbG9yNDogWzgyLCA1MSwgMTNdLFxuICAgIG9mZnNldEFYOiAwLFxuICAgIG9mZnNldEFZOiAwLFxuICAgIG9mZnNldEJYOiAzLjcsXG4gICAgb2Zmc2V0Qlk6IDAuOSxcbiAgICBvZmZzZXRDWDogMi4xLFxuICAgIG9mZnNldENZOiAzLjIsXG4gICAgb2Zmc2V0RFg6IDQuMyxcbiAgICBvZmZzZXREWTogMi44LFxuICAgIG9mZnNldFg6IDAsXG4gICAgb2Zmc2V0WTogMCxcbn07XG5cbmxldCBNYXJibGUxU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWJfYW5pbWF0ZTogeyB2YWx1ZTogc3RhdGUuYW5pbWF0ZSB9LFxuICAgICAgICBtYl9jb2xvcjE6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMS5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjI6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMi5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjM6IHsgdmFsdWU6IHN0YXRlLmNvbG9yMy5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9jb2xvcjQ6IHsgdmFsdWU6IHN0YXRlLmNvbG9yNC5tYXAoYyA9PiBjIC8gMjU1KSB9LFxuICAgICAgICBtYl9nYWluOiB7IHZhbHVlOiBzdGF0ZS5nYWluIH0sXG4gICAgICAgIG1iX2ludmVydDogeyB2YWx1ZTogc3RhdGUuaW52ZXJ0IH0sXG4gICAgICAgIG1iX2xhY3VuYXJpdHk6IHsgdmFsdWU6IHN0YXRlLmxhY3VuYXJpdHkgfSxcbiAgICAgICAgbWJfbm9pc2VNb2RlOiB7IHZhbHVlOiBzdGF0ZS5ub2lzZU1vZGUgPT09ICdzY2FsZScgPyAwIDogMSB9LFxuICAgICAgICBtYl9vY3RhdmVzOiB7IHZhbHVlOiBzdGF0ZS5vY3RhdmVzIH0sXG4gICAgICAgIG1iX29mZnNldDogeyB2YWx1ZTogW3N0YXRlLm9mZnNldFgsIHN0YXRlLm9mZnNldFldIH0sXG4gICAgICAgIG1iX29mZnNldEE6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRBWCwgc3RhdGUub2Zmc2V0QVldIH0sXG4gICAgICAgIG1iX29mZnNldEI6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRCWCwgc3RhdGUub2Zmc2V0QlldIH0sXG4gICAgICAgIG1iX29mZnNldEM6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRDWCwgc3RhdGUub2Zmc2V0Q1ldIH0sXG4gICAgICAgIG1iX29mZnNldEQ6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXREWCwgc3RhdGUub2Zmc2V0RFldIH0sXG4gICAgICAgIG1iX3NjYWxlMTogeyB2YWx1ZTogc3RhdGUuc2NhbGUxIH0sXG4gICAgICAgIG1iX3NjYWxlMjogeyB2YWx1ZTogc3RhdGUuc2NhbGUyIH0sXG4gICAgICAgIG1iX3NjYWxlQnlQcmV2OiB7IHZhbHVlOiBzdGF0ZS5zY2FsZUJ5UHJldiB9LFxuICAgICAgICBtYl9zaGFycGVuOiB7IHZhbHVlOiBzdGF0ZS5zaGFycGVuIH0sXG4gICAgICAgIG1iX3RpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgbWJfdGltZVNjYWxlOiB7IHZhbHVlOiBbc3RhdGUudGltZVNjYWxlWCwgc3RhdGUudGltZVNjYWxlWV0gfSxcbiAgICAgICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9ICAgIFxuICAgIH0sXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX2FuaW1hdGU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IxO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3I0O1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9nYWluO1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX2ludmVydDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfbGFjdW5hcml0eTtcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IG1iX25vaXNlTW9kZTtcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IG1iX29jdGF2ZXM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0O1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEE7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRDO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3NjYWxlMTtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfc2NhbGUyO1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX3NjYWxlQnlQcmV2O1xuICAgICAgICAgICAgdW5pZm9ybSBib29sIG1iX3NoYXJwZW47XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3RpbWU7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfdGltZVNjYWxlO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgICAgICAgICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgLy8gU29tZSB1c2VmdWwgZnVuY3Rpb25zXG4gICAgICAgIHZlYzMgbWJfbW9kMjg5KHZlYzMgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XG4gICAgICAgIHZlYzIgbWJfbW9kMjg5KHZlYzIgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XG4gICAgICAgIHZlYzMgbWJfcGVybXV0ZSh2ZWMzIHgpIHsgcmV0dXJuIG1iX21vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTsgfVxuICAgICAgICBcbiAgICAgICAgLy9cbiAgICAgICAgLy8gRGVzY3JpcHRpb24gOiBHTFNMIDJEIHNpbXBsZXggbm9pc2UgZnVuY3Rpb25cbiAgICAgICAgLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0c1xuICAgICAgICAvLyAgTWFpbnRhaW5lciA6IGlqbVxuICAgICAgICAvLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4gICAgICAgIC8vICAgICBMaWNlbnNlIDpcbiAgICAgICAgLy8gIENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAgICAgICAgLy8gIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZS5cbiAgICAgICAgLy8gIGh0dHBzOi8vZ2l0aHViLmNvbS9hc2hpbWEvd2ViZ2wtbm9pc2VcbiAgICAgICAgLy9cbiAgICAgICAgZmxvYXQgbWJfc25vaXNlKHZlYzIgdikge1xuICAgICAgICAgICAgLy8gUHJlY29tcHV0ZSB2YWx1ZXMgZm9yIHNrZXdlZCB0cmlhbmd1bGFyIGdyaWRcbiAgICAgICAgICAgIGNvbnN0IHZlYzQgQyA9IHZlYzQoMC4yMTEzMjQ4NjU0MDUxODcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICgzLjAtc3FydCgzLjApKS82LjBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMC4zNjYwMjU0MDM3ODQ0MzksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAuNSooc3FydCgzLjApLTEuMClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLTAuNTc3MzUwMjY5MTg5NjI2LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAtMS4wICsgMi4wICogQy54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuMDI0MzkwMjQzOTAyNDM5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMS4wIC8gNDEuMFxuICAgICAgICBcbiAgICAgICAgICAgIC8vIEZpcnN0IGNvcm5lciAoeDApXG4gICAgICAgICAgICB2ZWMyIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5KSk7XG4gICAgICAgICAgICB2ZWMyIHgwID0gdiAtIGkgKyBkb3QoaSwgQy54eCk7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gT3RoZXIgdHdvIGNvcm5lcnMgKHgxLCB4MilcbiAgICAgICAgICAgIHZlYzIgaTEgPSB2ZWMyKDAuMCk7XG4gICAgICAgICAgICBpMSA9ICh4MC54ID4geDAueSk/IHZlYzIoMS4wLCAwLjApOnZlYzIoMC4wLCAxLjApO1xuICAgICAgICAgICAgdmVjMiB4MSA9IHgwLnh5ICsgQy54eCAtIGkxO1xuICAgICAgICAgICAgdmVjMiB4MiA9IHgwLnh5ICsgQy56ejtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBEbyBzb21lIHBlcm11dGF0aW9ucyB0byBhdm9pZFxuICAgICAgICAgICAgLy8gdHJ1bmNhdGlvbiBlZmZlY3RzIGluIHBlcm11dGF0aW9uXG4gICAgICAgICAgICBpID0gbWJfbW9kMjg5KGkpO1xuICAgICAgICAgICAgdmVjMyBwID0gbWJfcGVybXV0ZShcbiAgICAgICAgICAgICAgICAgICAgbWJfcGVybXV0ZSggaS55ICsgdmVjMygwLjAsIGkxLnksIDEuMCkpXG4gICAgICAgICAgICAgICAgICAgICAgICArIGkueCArIHZlYzMoMC4wLCBpMS54LCAxLjAgKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBtID0gbWF4KDAuNSAtIHZlYzMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4MCx4MCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4MSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdCh4Mix4MilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSwgMC4wKTtcbiAgICAgICAgXG4gICAgICAgICAgICBtID0gbSptO1xuICAgICAgICAgICAgbSA9IG0qbTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBHcmFkaWVudHM6XG4gICAgICAgICAgICAvLyAgNDEgcHRzIHVuaWZvcm1seSBvdmVyIGEgbGluZSwgbWFwcGVkIG9udG8gYSBkaWFtb25kXG4gICAgICAgICAgICAvLyAgVGhlIHJpbmcgc2l6ZSAxNyoxNyA9IDI4OSBpcyBjbG9zZSB0byBhIG11bHRpcGxlXG4gICAgICAgICAgICAvLyAgICAgIG9mIDQxICg0MSo3ID0gMjg3KVxuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgeCA9IDIuMCAqIGZyYWN0KHAgKiBDLnd3dykgLSAxLjA7XG4gICAgICAgICAgICB2ZWMzIGggPSBhYnMoeCkgLSAwLjU7XG4gICAgICAgICAgICB2ZWMzIG94ID0gZmxvb3IoeCArIDAuNSk7XG4gICAgICAgICAgICB2ZWMzIGEwID0geCAtIG94O1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIE5vcm1hbGlzZSBncmFkaWVudHMgaW1wbGljaXRseSBieSBzY2FsaW5nIG1cbiAgICAgICAgICAgIC8vIEFwcHJveGltYXRpb24gb2Y6IG0gKj0gaW52ZXJzZXNxcnQoYTAqYTAgKyBoKmgpO1xuICAgICAgICAgICAgbSAqPSAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqIChhMCphMCtoKmgpO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIENvbXB1dGUgZmluYWwgbm9pc2UgdmFsdWUgYXQgUFxuICAgICAgICAgICAgdmVjMyBnID0gdmVjMygwLjApO1xuICAgICAgICAgICAgZy54ICA9IGEwLnggICogeDAueCAgKyBoLnggICogeDAueTtcbiAgICAgICAgICAgIGcueXogPSBhMC55eiAqIHZlYzIoeDEueCx4Mi54KSArIGgueXogKiB2ZWMyKHgxLnkseDIueSk7XG4gICAgICAgICAgICByZXR1cm4gMTMwLjAgKiBkb3QobSwgZyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG1iX2dldE5vaXNlVmFsKHZlYzIgcCkge1xuICAgICAgICAgICAgZmxvYXQgcmF3ID0gbWJfc25vaXNlKHApO1xuICAgICAgICBcbiAgICAgICAgICAgIGlmIChtYl9ub2lzZU1vZGUgPT0gMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhYnMocmF3KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gcmF3ICogMC41ICsgMC41O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9mYm0odmVjMiBwKSB7XG4gICAgICAgICAgICBmbG9hdCBzdW0gPSAwLjA7XG4gICAgICAgICAgICBmbG9hdCBmcmVxID0gMS4wO1xuICAgICAgICAgICAgZmxvYXQgYW1wID0gMC41O1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDEuMDtcbiAgICAgICAgXG4gICAgICAgICAgICBmb3IgKGludCBpID0gMDsgaSA8IG1iX29jdGF2ZXM7IGkrKykge1xuICAgICAgICAgICAgICAgIGZsb2F0IG4gPSBtYl9nZXROb2lzZVZhbChwICogZnJlcSk7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9pbnZlcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IDEuMCAtIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfc2hhcnBlbikge1xuICAgICAgICAgICAgICAgICAgICBuID0gbiAqIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBzdW0gKz0gbiAqIGFtcDtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX3NjYWxlQnlQcmV2KSB7XG4gICAgICAgICAgICAgICAgICAgIHN1bSArPSBuICogYW1wICogcHJldjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIHByZXYgPSBuO1xuICAgICAgICAgICAgICAgIGZyZXEgKj0gbWJfbGFjdW5hcml0eTtcbiAgICAgICAgICAgICAgICBhbXAgKj0gbWJfZ2FpbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gc3VtO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9wYXR0ZXJuKGluIHZlYzIgcCwgb3V0IHZlYzIgcSwgb3V0IHZlYzIgcikge1xuICAgICAgICAgICAgcCAqPSBtYl9zY2FsZTE7XG4gICAgICAgICAgICBwICs9IG1iX29mZnNldDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gMC4wO1xuICAgICAgICAgICAgaWYgKG1iX2FuaW1hdGUpIHtcbiAgICAgICAgICAgICAgICB0ID0gbWJfdGltZSAqIDAuMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICBxID0gdmVjMihtYl9mYm0ocCArIG1iX29mZnNldEEgKyB0ICogbWJfdGltZVNjYWxlLngpLCBtYl9mYm0ocCArIG1iX29mZnNldEIgLSB0ICogbWJfdGltZVNjYWxlLnkpKTtcbiAgICAgICAgICAgIHIgPSB2ZWMyKG1iX2ZibShwICsgbWJfc2NhbGUyICogcSArIG1iX29mZnNldEMpLCBtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHEgKyBtYl9vZmZzZXREKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG1iX2ZibShwICsgbWJfc2NhbGUyICogcik7XG4gICAgICAgIH1cbiAgICBgLFxuICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgIHZlYzMgbWFyYmxlQ29sb3IgPSB2ZWMzKDAuMCk7XG5cbiAgICAgICAgdmVjMiBxO1xuICAgICAgICB2ZWMyIHI7XG5cbiAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyBcbiAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG5cbiAgICAgICAgZmxvYXQgZiA9IG1iX3BhdHRlcm4odXYsIHEsIHIpO1xuICAgICAgICBcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWJfY29sb3IxLCBtYl9jb2xvcjIsIGYpO1xuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYXJibGVDb2xvciwgbWJfY29sb3IzLCBsZW5ndGgocSkgLyAyLjApO1xuICAgICAgICBtYXJibGVDb2xvciA9IG1peChtYXJibGVDb2xvciwgbWJfY29sb3I0LCByLnkgLyAyLjApO1xuXG4gICAgICAgIHZlYzQgbWFyYmxlQ29sb3I0ID0gbWFwVGV4ZWxUb0xpbmVhciggdmVjNChtYXJibGVDb2xvciwxLjApICk7XG5cbiAgICAgICAgZGlmZnVzZUNvbG9yICo9IG1hcmJsZUNvbG9yNDtcbiAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuXG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9pbnZlcnQgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gc3RhdGUuaW52ZXJ0IDogIXN0YXRlLmludmVydCB9XG5cbiAgICAgICAgLy8gbGV0cyBhZGQgYSBiaXQgb2YgcmFuZG9tbmVzcyB0byB0aGUgaW5wdXQgc28gbXVsdGlwbGUgaW5zdGFuY2VzIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgbGV0IHJ4ID0gTWF0aC5yYW5kb20oKVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9vZmZzZXRBID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIHN0YXRlLm9mZnNldEFYICsgTWF0aC5yYW5kb20oKSwgc3RhdGUub2Zmc2V0QVkgKyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX29mZnNldEIgPSB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMiggc3RhdGUub2Zmc2V0QlggKyBNYXRoLnJhbmRvbSgpLCBzdGF0ZS5vZmZzZXRCWSArIE1hdGgucmFuZG9tKCkpIH1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfdGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgIH1cbn1cblxuZXhwb3J0IHsgTWFyYmxlMVNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vbGNhZ21hYy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzLzFlYzk2NWM1ZDZkZjU3N2MuanBnXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzR0MzN6OFxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCBub3RGb3VuZCBmcm9tICcuLi9hc3NldHMvYmFkU2hhZGVyLmpwZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgaUNoYW5uZWwxOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQoc21hbGxOb2lzZSwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZVRleCA9IG5vaXNlXG59KVxudmFyIG5vdEZvdW5kVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZChub3RGb3VuZCwgKG5vaXNlKSA9PiB7XG4gICAgbm9pc2UubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2Uud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub3RGb3VuZFRleCA9IG5vaXNlXG59KVxuXG5sZXQgTm90Rm91bmRTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgaUNoYW5uZWwwO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDE7XG4gICAgICAgIGAsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgICAgICAgICB2ZWMyIHdhcnBVViA9IDIuICogdXY7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZCA9IGxlbmd0aCggd2FycFVWICk7XG4gICAgICAgICAgICB2ZWMyIHN0ID0gd2FycFVWKjAuMSArIDAuMip2ZWMyKGNvcygwLjA3MSppVGltZSoyLitkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW4oMC4wNzMqaVRpbWUqMi4tZCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgd2FycGVkQ29sID0gdGV4dHVyZSggaUNoYW5uZWwwLCBzdCApLnh5eiAqIDIuMDtcbiAgICAgICAgICAgIGZsb2F0IHcgPSBtYXgoIHdhcnBlZENvbC5yLCAwLjg1KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMiBvZmZzZXQgPSAwLjAxICogY29zKCB3YXJwZWRDb2wucmcgKiAzLjE0MTU5ICk7XG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHRleHR1cmUoIGlDaGFubmVsMSwgdXYgKyBvZmZzZXQgKS5yZ2IgKiB2ZWMzKDAuOCwgMC44LCAxLjUpIDtcbiAgICAgICAgICAgIGNvbCAqPSB3KjEuMjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNCggbWl4KGNvbCwgdGV4dHVyZSggaUNoYW5uZWwxLCB1diArIG9mZnNldCApLnJnYiwgMC41KSwgIDEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDEudmFsdWUgPSBub3RGb3VuZFRleFxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwxLnZhbHVlID0gbm90Rm91bmRUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IE5vdEZvdW5kU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly9sY2FnbWFjLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvNDgxYTkyYjQ0ZTU2ZGFkNC5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCB1bmlmb3JtcyA9IHtcbiAgICB3YXJwVGltZToge3ZhbHVlOiAwfSxcbiAgICB3YXJwVGV4OiB7dmFsdWU6IG51bGx9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn0gXG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxufSlcblxubGV0IFdhcnBTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIGZsb2F0IHdhcnBUaW1lO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCB3YXJwVGV4O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICB1bmlmb3JtIGludCB0ZXhGbGlwWTsgXG4gICAgICAgICAgICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgICBmbG9hdCB0ID0gd2FycFRpbWU7XG5cbiAgICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgXG4gICAgICAgICAgdmVjMiBzY2FsZWRVViA9IHV2ICogMi4wIC0gMS4wO1xuICAgICAgICAgIHZlYzIgcHV2ID0gdmVjMihsZW5ndGgoc2NhbGVkVVYueHkpLCBhdGFuKHNjYWxlZFVWLngsIHNjYWxlZFVWLnkpKTtcbiAgICAgICAgICB2ZWM0IGNvbCA9IHRleHR1cmUyRCh3YXJwVGV4LCB2ZWMyKGxvZyhwdXYueCkgKyB0IC8gNS4wLCBwdXYueSAvIDMuMTQxNTkyNiApKTtcbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgV2FycFNoYWRlciB9XG4iLCIvKlxuICogM0QgU2ltcGxleCBub2lzZVxuICogU0lHTkFUVVJFOiBmbG9hdCBzbm9pc2UodmVjMyB2KVxuICogaHR0cHM6Ly9naXRodWIuY29tL2h1Z2hzay9nbHNsLW5vaXNlXG4gKi9cblxuY29uc3QgZ2xzbCA9IGBcbi8vXG4vLyBEZXNjcmlwdGlvbiA6IEFycmF5IGFuZCB0ZXh0dXJlbGVzcyBHTFNMIDJELzNELzREIHNpbXBsZXhcbi8vICAgICAgICAgICAgICAgbm9pc2UgZnVuY3Rpb25zLlxuLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0cy5cbi8vICBNYWludGFpbmVyIDogaWptXG4vLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4vLyAgICAgTGljZW5zZSA6IENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vICAgICAgICAgICAgICAgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRSBmaWxlLlxuLy8gICAgICAgICAgICAgICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4vL1xuXG52ZWMzIG1vZDI4OSh2ZWMzIHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBtb2QyODkodmVjNCB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgcGVybXV0ZSh2ZWM0IHgpIHtcbiAgICAgcmV0dXJuIG1vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTtcbn1cblxudmVjNCB0YXlsb3JJbnZTcXJ0KHZlYzQgcilcbntcbiAgcmV0dXJuIDEuNzkyODQyOTE0MDAxNTkgLSAwLjg1MzczNDcyMDk1MzE0ICogcjtcbn1cblxuZmxvYXQgc25vaXNlKHZlYzMgdilcbiAge1xuICBjb25zdCB2ZWMyICBDID0gdmVjMigxLjAvNi4wLCAxLjAvMy4wKSA7XG4gIGNvbnN0IHZlYzQgIEQgPSB2ZWM0KDAuMCwgMC41LCAxLjAsIDIuMCk7XG5cbi8vIEZpcnN0IGNvcm5lclxuICB2ZWMzIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5eSkgKTtcbiAgdmVjMyB4MCA9ICAgdiAtIGkgKyBkb3QoaSwgQy54eHgpIDtcblxuLy8gT3RoZXIgY29ybmVyc1xuICB2ZWMzIGcgPSBzdGVwKHgwLnl6eCwgeDAueHl6KTtcbiAgdmVjMyBsID0gMS4wIC0gZztcbiAgdmVjMyBpMSA9IG1pbiggZy54eXosIGwuenh5ICk7XG4gIHZlYzMgaTIgPSBtYXgoIGcueHl6LCBsLnp4eSApO1xuXG4gIC8vICAgeDAgPSB4MCAtIDAuMCArIDAuMCAqIEMueHh4O1xuICAvLyAgIHgxID0geDAgLSBpMSAgKyAxLjAgKiBDLnh4eDtcbiAgLy8gICB4MiA9IHgwIC0gaTIgICsgMi4wICogQy54eHg7XG4gIC8vICAgeDMgPSB4MCAtIDEuMCArIDMuMCAqIEMueHh4O1xuICB2ZWMzIHgxID0geDAgLSBpMSArIEMueHh4O1xuICB2ZWMzIHgyID0geDAgLSBpMiArIEMueXl5OyAvLyAyLjAqQy54ID0gMS8zID0gQy55XG4gIHZlYzMgeDMgPSB4MCAtIEQueXl5OyAgICAgIC8vIC0xLjArMy4wKkMueCA9IC0wLjUgPSAtRC55XG5cbi8vIFBlcm11dGF0aW9uc1xuICBpID0gbW9kMjg5KGkpO1xuICB2ZWM0IHAgPSBwZXJtdXRlKCBwZXJtdXRlKCBwZXJtdXRlKFxuICAgICAgICAgICAgIGkueiArIHZlYzQoMC4wLCBpMS56LCBpMi56LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnkgKyB2ZWM0KDAuMCwgaTEueSwgaTIueSwgMS4wICkpXG4gICAgICAgICAgICsgaS54ICsgdmVjNCgwLjAsIGkxLngsIGkyLngsIDEuMCApKTtcblxuLy8gR3JhZGllbnRzOiA3eDcgcG9pbnRzIG92ZXIgYSBzcXVhcmUsIG1hcHBlZCBvbnRvIGFuIG9jdGFoZWRyb24uXG4vLyBUaGUgcmluZyBzaXplIDE3KjE3ID0gMjg5IGlzIGNsb3NlIHRvIGEgbXVsdGlwbGUgb2YgNDkgKDQ5KjYgPSAyOTQpXG4gIGZsb2F0IG5fID0gMC4xNDI4NTcxNDI4NTc7IC8vIDEuMC83LjBcbiAgdmVjMyAgbnMgPSBuXyAqIEQud3l6IC0gRC54eng7XG5cbiAgdmVjNCBqID0gcCAtIDQ5LjAgKiBmbG9vcihwICogbnMueiAqIG5zLnopOyAgLy8gIG1vZChwLDcqNylcblxuICB2ZWM0IHhfID0gZmxvb3IoaiAqIG5zLnopO1xuICB2ZWM0IHlfID0gZmxvb3IoaiAtIDcuMCAqIHhfICk7ICAgIC8vIG1vZChqLE4pXG5cbiAgdmVjNCB4ID0geF8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IHkgPSB5XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgaCA9IDEuMCAtIGFicyh4KSAtIGFicyh5KTtcblxuICB2ZWM0IGIwID0gdmVjNCggeC54eSwgeS54eSApO1xuICB2ZWM0IGIxID0gdmVjNCggeC56dywgeS56dyApO1xuXG4gIC8vdmVjNCBzMCA9IHZlYzQobGVzc1RoYW4oYjAsMC4wKSkqMi4wIC0gMS4wO1xuICAvL3ZlYzQgczEgPSB2ZWM0KGxlc3NUaGFuKGIxLDAuMCkpKjIuMCAtIDEuMDtcbiAgdmVjNCBzMCA9IGZsb29yKGIwKSoyLjAgKyAxLjA7XG4gIHZlYzQgczEgPSBmbG9vcihiMSkqMi4wICsgMS4wO1xuICB2ZWM0IHNoID0gLXN0ZXAoaCwgdmVjNCgwLjApKTtcblxuICB2ZWM0IGEwID0gYjAueHp5dyArIHMwLnh6eXcqc2gueHh5eSA7XG4gIHZlYzQgYTEgPSBiMS54enl3ICsgczEueHp5dypzaC56end3IDtcblxuICB2ZWMzIHAwID0gdmVjMyhhMC54eSxoLngpO1xuICB2ZWMzIHAxID0gdmVjMyhhMC56dyxoLnkpO1xuICB2ZWMzIHAyID0gdmVjMyhhMS54eSxoLnopO1xuICB2ZWMzIHAzID0gdmVjMyhhMS56dyxoLncpO1xuXG4vL05vcm1hbGlzZSBncmFkaWVudHNcbiAgdmVjNCBub3JtID0gdGF5bG9ySW52U3FydCh2ZWM0KGRvdChwMCxwMCksIGRvdChwMSxwMSksIGRvdChwMiwgcDIpLCBkb3QocDMscDMpKSk7XG4gIHAwICo9IG5vcm0ueDtcbiAgcDEgKj0gbm9ybS55O1xuICBwMiAqPSBub3JtLno7XG4gIHAzICo9IG5vcm0udztcblxuLy8gTWl4IGZpbmFsIG5vaXNlIHZhbHVlXG4gIHZlYzQgbSA9IG1heCgwLjYgLSB2ZWM0KGRvdCh4MCx4MCksIGRvdCh4MSx4MSksIGRvdCh4Mix4MiksIGRvdCh4Myx4MykpLCAwLjApO1xuICBtID0gbSAqIG07XG4gIHJldHVybiA0Mi4wICogZG90KCBtKm0sIHZlYzQoIGRvdChwMCx4MCksIGRvdChwMSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdChwMix4MiksIGRvdChwMyx4MykgKSApO1xuICB9ICBcbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuL3Nub2lzZSdcbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IHVuaWZvcm1zID0ge1xuICAgIHdhcnBUaW1lOiB7dmFsdWU6IDB9LFxuICAgIHdhcnBUZXg6IHt2YWx1ZTogbnVsbH0sXG4gICAgdGV4UmVwZWF0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH0sXG4gICAgdGV4T2Zmc2V0OiB7IHZhbHVlOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH0sXG4gICAgdGV4RmxpcFk6IHsgdmFsdWU6IDAgfSxcbiAgICBwb3J0YWxDdWJlTWFwOiB7IHZhbHVlOiBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKSB9LFxuICAgIHBvcnRhbFRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICBwb3J0YWxSYWRpdXM6IHsgdmFsdWU6IDAuNSB9LFxuICAgIHBvcnRhbFJpbmdDb2xvcjogeyB2YWx1ZTogbmV3IFRIUkVFLkNvbG9yKFwicmVkXCIpICB9LFxuICAgIGludmVydFdhcnBDb2xvcjogeyB2YWx1ZTogMCB9LFxuICAgIHRleEludlNpemU6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfVxufSBcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmxldCBjdWJlTWFwID0gbmV3IFRIUkVFLkN1YmVUZXh0dXJlKClcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIHdhcnBUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKHdhcnBmeCwgKHdhcnApID0+IHtcbiAgICB3YXJwLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RNaXBtYXBOZWFyZXN0RmlsdGVyO1xuICAgIHdhcnAubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdE1pcG1hcE5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxuICAgIGN1YmVNYXAuaW1hZ2VzID0gW3dhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2UsIHdhcnAuaW1hZ2VdXG4gICAgY3ViZU1hcC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxldCBXYXJwUG9ydGFsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdmFyeWluZyB2ZWMzIHZSYXk7XG4gICAgICAgIHZhcnlpbmcgdmVjMyBwb3J0YWxOb3JtYWw7XG4gICAgICAgIC8vdmFyeWluZyB2ZWMzIGNhbWVyYUxvY2FsO1xuICAgICAgICBgLFxuICAgICAgICBwb3N0VHJhbnNmb3JtOiBnbHNsYFxuICAgICAgICAvLyB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxNYXRyaXgpICogdmVjNChjYW1lcmFQb3NpdGlvbiwgMS4wKSkueHl6O1xuICAgICAgICB2ZWMzIGNhbWVyYUxvY2FsID0gKGludmVyc2UobW9kZWxWaWV3TWF0cml4KSAqIHZlYzQoMC4wLDAuMCwwLjAsIDEuMCkpLnh5ejtcbiAgICAgICAgdlJheSA9IHBvc2l0aW9uIC0gY2FtZXJhTG9jYWw7XG4gICAgICAgIGlmICh2UmF5LnogPCAwLjApIHtcbiAgICAgICAgICAgIHZSYXkueiA9IC12UmF5Lno7XG4gICAgICAgICAgICB2UmF5LnggPSAtdlJheS54O1xuICAgICAgICB9XG4gICAgICAgIC8vdlJheSA9IHZlYzMobXZQb3NpdGlvbi54LCBtdlBvc2l0aW9uLnksIG12UG9zaXRpb24ueik7XG4gICAgICAgIHBvcnRhbE5vcm1hbCA9IG5vcm1hbGl6ZSgtMS4gKiB2UmF5KTtcbiAgICAgICAgLy9mbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aChjYW1lcmFMb2NhbCk7XG4gICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKHZSYXkpO1xuICAgICAgICB2UmF5LnogKj0gMS4xIC8gKDEuICsgcG93KHBvcnRhbF9kaXN0LCAwLjUpKTsgLy8gQ2hhbmdlIEZPViBieSBzcXVhc2hpbmcgbG9jYWwgWiBkaXJlY3Rpb25cbiAgICAgIGBcbiAgICB9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgZnVuY3Rpb25zOiBzbm9pc2UsXG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIHNhbXBsZXJDdWJlIHBvcnRhbEN1YmVNYXA7XG4gICAgICAgIHVuaWZvcm0gZmxvYXQgcG9ydGFsUmFkaXVzO1xuICAgICAgICB1bmlmb3JtIHZlYzMgcG9ydGFsUmluZ0NvbG9yO1xuICAgICAgICB1bmlmb3JtIGZsb2F0IHBvcnRhbFRpbWU7XG4gICAgICAgIHVuaWZvcm0gaW50IGludmVydFdhcnBDb2xvcjtcblxuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4SW52U2l6ZTtcblxuICAgICAgICB2YXJ5aW5nIHZlYzMgdlJheTtcbiAgICAgICAgdmFyeWluZyB2ZWMzIHBvcnRhbE5vcm1hbDtcbiAgICAgICAvLyB2YXJ5aW5nIHZlYzMgY2FtZXJhTG9jYWw7XG5cbiAgICAgICAgdW5pZm9ybSBmbG9hdCB3YXJwVGltZTtcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgd2FycFRleDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleFJlcGVhdDtcbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbiAgICAgICAgdW5pZm9ybSBpbnQgdGV4RmxpcFk7IFxuXG4gICAgICAgICNkZWZpbmUgUklOR19XSURUSCAwLjFcbiAgICAgICAgI2RlZmluZSBSSU5HX0hBUkRfT1VURVIgMC4wMVxuICAgICAgICAjZGVmaW5lIFJJTkdfSEFSRF9JTk5FUiAwLjA4XG4gICAgICAgIGAsXG4gICAgICAgIHJlcGxhY2VNYXA6IGdsc2xgXG4gICAgICAgICAgZmxvYXQgdCA9IHdhcnBUaW1lO1xuXG4gICAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgICAgaWYgKHV2LnggPCAwLjApIHsgdXYueCA9IHV2LnggKyAxLjA7fVxuICAgICAgICAgIGlmICh1di55IDwgMC4wKSB7IHV2LnkgPSB1di55ICsgMS4wO31cbiAgICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICAgIHV2LnkgPSBjbGFtcCh1di55LCAwLjAsIDEuMCk7XG4gIFxuICAgICAgICAgIHZlYzIgc2NhbGVkVVYgPSB1diAqIDIuMCAtIDEuMDtcbiAgICAgICAgICB2ZWMyIHB1diA9IHZlYzIobGVuZ3RoKHNjYWxlZFVWLnh5KSwgYXRhbihzY2FsZWRVVi54LCBzY2FsZWRVVi55KSk7XG4gICAgICAgICAgdmVjNCBjb2wgPSB0ZXh0dXJlMkQod2FycFRleCwgdmVjMihsb2cocHV2LngpICsgdCAvIDUuMCwgcHV2LnkgLyAzLjE0MTU5MjYgKSk7XG5cbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICBcbiAgICAgICAgICBpZiAoaW52ZXJ0V2FycENvbG9yID4gMCkge1xuICAgICAgICAgICAgICBjb2wgPSB2ZWM0KGNvbC5iLCBjb2wuZywgY29sLnIsIGNvbC5hKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLy8gcG9ydGFsIHNoYWRlciBlZmZlY3RcbiAgICAgICAgICB2ZWMyIHBvcnRhbF9jb29yZCA9IHZVdiAqIDIuMCAtIDEuMDtcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfbm9pc2UgPSBzbm9pc2UodmVjMyhwb3J0YWxfY29vcmQgKiAxLiwgcG9ydGFsVGltZSkpICogMC41ICsgMC41O1xuICAgICAgICBcbiAgICAgICAgICAvLyBQb2xhciBkaXN0YW5jZVxuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0ID0gbGVuZ3RoKHBvcnRhbF9jb29yZCk7XG4gICAgICAgICAgcG9ydGFsX2Rpc3QgKz0gcG9ydGFsX25vaXNlICogMC4yO1xuICAgICAgICBcbiAgICAgICAgICBmbG9hdCBtYXNrT3V0ZXIgPSAxLjAgLSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIFJJTkdfSEFSRF9PVVRFUiwgcG9ydGFsUmFkaXVzLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgZmxvYXQgbWFza0lubmVyID0gMS4wIC0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSBSSU5HX1dJRFRILCBwb3J0YWxSYWRpdXMgLSBSSU5HX1dJRFRIICsgUklOR19IQVJEX0lOTkVSLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgZmxvYXQgcG9ydGFsX2Rpc3RvcnRpb24gPSBzbW9vdGhzdGVwKHBvcnRhbFJhZGl1cyAtIDAuMiwgcG9ydGFsUmFkaXVzICsgMC4yLCBwb3J0YWxfZGlzdCk7XG4gICAgICAgICAgXG4gICAgICAgICAgdmVjMyBwb3J0YWxub3JtYWwgPSBub3JtYWxpemUocG9ydGFsTm9ybWFsKTtcbiAgICAgICAgICB2ZWMzIGZvcndhcmRQb3J0YWwgPSB2ZWMzKDAuMCwgMC4wLCAtMS4wKTtcblxuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXJlY3RWaWV3ID0gc21vb3Roc3RlcCgwLjAsIDAuOCwgZG90KHBvcnRhbG5vcm1hbCwgZm9yd2FyZFBvcnRhbCkpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX3RhbmdlbnRPdXR3YXJkID0gbm9ybWFsaXplKHZlYzMocG9ydGFsX2Nvb3JkLCAwLjApKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF9yYXkgPSBtaXgodlJheSwgcG9ydGFsX3RhbmdlbnRPdXR3YXJkLCBwb3J0YWxfZGlzdG9ydGlvbik7XG5cbiAgICAgICAgICB2ZWM0IG15Q3ViZVRleGVsID0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgcG9ydGFsX3JheSk7XG5cbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LnggLSB0ZXhJbnZTaXplLnMsIHBvcnRhbF9yYXkueXopKSkgLyA4LjA7ICAgICAgICBcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LnggLSB0ZXhJbnZTaXplLnMsIHBvcnRhbF9yYXkueXopKSkgLyA4LjA7ICAgICAgICBcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCArPSB0ZXh0dXJlQ3ViZShwb3J0YWxDdWJlTWFwLCBub3JtYWxpemUodmVjMyhwb3J0YWxfcmF5LngsIHBvcnRhbF9yYXkueSAtIHRleEludlNpemUudCwgcG9ydGFsX3JheS56KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54LCBwb3J0YWxfcmF5LnkgLSB0ZXhJbnZTaXplLnQsIHBvcnRhbF9yYXkueikpKSAvIDguMDsgICAgICAgIFxuXG4gICAgICAgICAgbXlDdWJlVGV4ZWwgPSBtYXBUZXhlbFRvTGluZWFyKCBteUN1YmVUZXhlbCApO1xuXG4gICAgICAgIC8vICAgdmVjNCBwb3NDb2wgPSB2ZWM0KHNtb290aHN0ZXAoLTYuMCwgNi4wLCBjYW1lcmFMb2NhbCksIDEuMCk7IC8vbm9ybWFsaXplKChjYW1lcmFMb2NhbCAvIDYuMCkpO1xuICAgICAgICAvLyAgIG15Q3ViZVRleGVsID0gcG9zQ29sOyAvLyB2ZWM0KHBvc0NvbC54LCBwb3NDb2wueSwgcG9zQ29sLnksIDEuMCk7XG4gICAgICAgICAgdmVjMyBjZW50ZXJMYXllciA9IG15Q3ViZVRleGVsLnJnYiAqIG1hc2tJbm5lcjtcbiAgICAgICAgICB2ZWMzIHJpbmdMYXllciA9IHBvcnRhbFJpbmdDb2xvciAqICgxLiAtIG1hc2tJbm5lcik7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfY29tcG9zaXRlID0gY2VudGVyTGF5ZXIgKyByaW5nTGF5ZXI7XG4gICAgICAgIFxuICAgICAgICAgIC8vZ2xfRnJhZ0NvbG9yIFxuICAgICAgICAgIHZlYzQgcG9ydGFsQ29sID0gdmVjNChwb3J0YWxfY29tcG9zaXRlLCAobWFza091dGVyIC0gbWFza0lubmVyKSArIG1hc2tJbm5lciAqIHBvcnRhbF9kaXJlY3RWaWV3KTtcbiAgICAgICAgXG4gICAgICAgICAgLy8gYmxlbmQgdGhlIHR3b1xuICAgICAgICAgIHBvcnRhbENvbC5yZ2IgKj0gcG9ydGFsQ29sLmE7IC8vcHJlbXVsdGlwbHkgc291cmNlIFxuICAgICAgICAgIGNvbC5yZ2IgKj0gKDEuMCAtIHBvcnRhbENvbC5hKTtcbiAgICAgICAgICBjb2wucmdiICs9IHBvcnRhbENvbC5yZ2I7XG5cbiAgICAgICAgICBkaWZmdXNlQ29sb3IgKj0gY29sO1xuICAgICAgICBgXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5yZXBlYXQgPyBtYXQubWFwLnJlcGVhdCA6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAub2Zmc2V0ID8gbWF0Lm1hcC5vZmZzZXQgOiBuZXcgVEhSRUUuVmVjdG9yMigwLDApIH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pbnZlcnRXYXJwQ29sb3IgPSB7IHZhbHVlOiBtYXQudXNlckRhdGEuaW52ZXJ0V2FycENvbG9yID8gbWF0LnVzZXJEYXRhLmludmVydFdhcnBDb2xvciA6IGZhbHNlfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSaW5nQ29sb3IgPSB7IHZhbHVlOiBtYXQudXNlckRhdGEucmluZ0NvbG9yID8gbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA6IG5ldyBUSFJFRS5Db2xvcihcInJlZFwiKSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbEN1YmVNYXAgPSB7IHZhbHVlOiBtYXQudXNlckRhdGEuY3ViZU1hcCA/IG1hdC51c2VyRGF0YS5jdWJlTWFwIDogY3ViZU1hcCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFJhZGl1cyA9ICB7dmFsdWU6IG1hdC51c2VyRGF0YS5yYWRpdXMgPyBtYXQudXNlckRhdGEucmFkaXVzIDogMC41fVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGV4LnZhbHVlID0gd2FycFRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxDdWJlTWFwLnZhbHVlID0gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcCA/IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgOiBjdWJlTWFwIFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSYWRpdXMudmFsdWUgPSBtYXRlcmlhbC51c2VyRGF0YS5yYWRpdXMgPyBtYXRlcmlhbC51c2VyRGF0YS5yYWRpdXMgOiAwLjVcblxuICAgICAgICBpZiAobWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcCAmJiBBcnJheS5pc0FycmF5KG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzKSAmJiBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlc1swXSkge1xuICAgICAgICAgICAgbGV0IGhlaWdodCA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzWzBdLmhlaWdodFxuICAgICAgICAgICAgbGV0IHdpZHRoID0gbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXNbMF0ud2lkdGhcbiAgICAgICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEludlNpemUudmFsdWUgPSBuZXcgVEhSRUUuVmVjdG9yMih3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuXG4gICAgfVxufVxuXG5cbmV4cG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfVxuIiwiLyoqXG4gKiBWYXJpb3VzIHNpbXBsZSBzaGFkZXJzXG4gKi9cblxuLy8gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TTogIEJsZWVweSBCbG9ja3NcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCwgRGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgYXMgTWF0ZXJpYWxNb2RpZmllciwgU2hhZGVyRXh0ZW5zaW9uT3B0cyB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5cbi8vIGFkZCAgaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzdkS0d6elxuXG5pbXBvcnQgeyBCbGVlcHlCbG9ja3NTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyJ1xuaW1wb3J0IHsgTm9pc2VTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vaXNlJ1xuaW1wb3J0IHsgTGlxdWlkTWFyYmxlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9saXF1aWQtbWFyYmxlJ1xuaW1wb3J0IHsgR2FsYXh5U2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9nYWxheHknXG5pbXBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9sYWNlLXR1bm5lbCdcbmltcG9ydCB7IEZpcmVUdW5uZWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL2ZpcmUtdHVubmVsJ1xuaW1wb3J0IHsgTWlzdFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbWlzdCdcbmltcG9ydCB7IE1hcmJsZTFTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21hcmJsZTEnXG5pbXBvcnQgeyBOb3RGb3VuZFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbm90LWZvdW5kJ1xuaW1wb3J0IHsgV2FycFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvd2FycCdcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsJ1xuXG5mdW5jdGlvbiBtYXBNYXRlcmlhbHMob2JqZWN0M0Q6IFRIUkVFLk9iamVjdDNELCBmbjogKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCkgPT4gdm9pZCkge1xuICAgIGxldCBtZXNoID0gb2JqZWN0M0QgYXMgVEhSRUUuTWVzaFxuICAgIGlmICghbWVzaC5tYXRlcmlhbCkgcmV0dXJuO1xuICBcbiAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xuICAgICAgcmV0dXJuIG1lc2gubWF0ZXJpYWwubWFwKGZuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZuKG1lc2gubWF0ZXJpYWwpO1xuICAgIH1cbn1cbiAgXG4gIC8vIFRPRE86ICBrZXkgYSByZWNvcmQgb2YgbmV3IG1hdGVyaWFscywgaW5kZXhlZCBieSB0aGUgb3JpZ2luYWxcbiAgLy8gbWF0ZXJpYWwgVVVJRCwgc28gd2UgY2FuIGp1c3QgcmV0dXJuIGl0IGlmIHJlcGxhY2UgaXMgY2FsbGVkIG9uXG4gIC8vIHRoZSBzYW1lIG1hdGVyaWFsIG1vcmUgdGhhbiBvbmNlXG4gIGV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTWF0ZXJpYWwgKG9sZE1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCwgc2hhZGVyOiBTaGFkZXJFeHRlbnNpb24sIHVzZXJEYXRhOiBhbnkpOiBudWxsIHwgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsIHtcbiAgICAvLyAgIGlmIChvbGRNYXRlcmlhbC50eXBlICE9IFwiTWVzaFN0YW5kYXJkTWF0ZXJpYWxcIikge1xuICAgIC8vICAgICAgIGNvbnNvbGUud2FybihcIlNoYWRlciBDb21wb25lbnQ6IGRvbid0IGtub3cgaG93IHRvIGhhbmRsZSBTaGFkZXJzIG9mIHR5cGUgJ1wiICsgb2xkTWF0ZXJpYWwudHlwZSArIFwiJywgb25seSBNZXNoU3RhbmRhcmRNYXRlcmlhbCBhdCB0aGlzIHRpbWUuXCIpXG4gICAgLy8gICAgICAgcmV0dXJuO1xuICAgIC8vICAgfVxuXG4gICAgICAvL2NvbnN0IG1hdGVyaWFsID0gb2xkTWF0ZXJpYWwuY2xvbmUoKTtcbiAgICAgIHZhciBDdXN0b21NYXRlcmlhbFxuICAgICAgdHJ5IHtcbiAgICAgICAgICBDdXN0b21NYXRlcmlhbCA9IE1hdGVyaWFsTW9kaWZpZXIuZXh0ZW5kIChvbGRNYXRlcmlhbC50eXBlLCB7XG4gICAgICAgICAgICB1bmlmb3Jtczogc2hhZGVyLnVuaWZvcm1zLFxuICAgICAgICAgICAgdmVydGV4U2hhZGVyOiBzaGFkZXIudmVydGV4U2hhZGVyLFxuICAgICAgICAgICAgZnJhZ21lbnRTaGFkZXI6IHNoYWRlci5mcmFnbWVudFNoYWRlclxuICAgICAgICAgIH0pXG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgLy8gY3JlYXRlIGEgbmV3IG1hdGVyaWFsLCBpbml0aWFsaXppbmcgdGhlIGJhc2UgcGFydCB3aXRoIHRoZSBvbGQgbWF0ZXJpYWwgaGVyZVxuICAgICAgbGV0IG1hdGVyaWFsID0gbmV3IEN1c3RvbU1hdGVyaWFsKClcblxuICAgICAgc3dpdGNoIChvbGRNYXRlcmlhbC50eXBlKSB7XG4gICAgICAgICAgY2FzZSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwiTWVzaFBob25nTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJNZXNoQmFzaWNNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIG1hdGVyaWFsLnVzZXJEYXRhID0gdXNlckRhdGE7XG4gICAgICBtYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICBzaGFkZXIuaW5pdChtYXRlcmlhbCk7XG4gICAgICBcbiAgICAgIHJldHVybiBtYXRlcmlhbFxuICB9XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVXaXRoU2hhZGVyKHNoYWRlckRlZjogU2hhZGVyRXh0ZW5zaW9uLCBlbDogYW55LCB0YXJnZXQ6IHN0cmluZywgdXNlckRhdGE6IGFueSA9IHt9KTogKFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbClbXSB7XG4gICAgLy8gbWVzaCB3b3VsZCBjb250YWluIHRoZSBvYmplY3QgdGhhdCBpcywgb3IgY29udGFpbnMsIHRoZSBtZXNoZXNcbiAgICB2YXIgbWVzaCA9IGVsLm9iamVjdDNETWFwLm1lc2hcbiAgICBpZiAoIW1lc2gpIHtcbiAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbiAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuICAgICAgICBtZXNoID0gZWwub2JqZWN0M0RcbiAgICB9XG4gICAgXG4gICAgbGV0IG1hdGVyaWFsczogYW55ID0gW11cbiAgICBsZXQgdHJhdmVyc2UgPSAob2JqZWN0OiBUSFJFRS5PYmplY3QzRCkgPT4ge1xuICAgICAgbGV0IG1lc2ggPSBvYmplY3QgYXMgVEhSRUUuTWVzaFxuICAgICAgaWYgKG1lc2gubWF0ZXJpYWwpIHtcbiAgICAgICAgICBtYXBNYXRlcmlhbHMobWVzaCwgKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCkgPT4geyAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCBtYXRlcmlhbC5uYW1lID09PSB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgIGxldCBuZXdNID0gcmVwbGFjZU1hdGVyaWFsKG1hdGVyaWFsLCBzaGFkZXJEZWYsIHVzZXJEYXRhKVxuICAgICAgICAgICAgICAgICAgaWYgKG5ld00pIHtcbiAgICAgICAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsID0gbmV3TVxuXG4gICAgICAgICAgICAgICAgICAgICAgbWF0ZXJpYWxzLnB1c2gobmV3TSlcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IG9iamVjdC5jaGlsZHJlbjtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICB0cmF2ZXJzZShjaGlsZHJlbltpXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHJhdmVyc2UobWVzaCk7XG4gICAgcmV0dXJuIG1hdGVyaWFsc1xuICB9XG5cbmNvbnN0IHZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IGZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKVxuXG5jb25zdCBvbmNlID0ge1xuICAgIG9uY2UgOiB0cnVlXG59O1xuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3NoYWRlcicsIHtcbiAgICBtYXRlcmlhbHM6IG51bGwgYXMgKFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbClbXSB8IG51bGwsICBcbiAgICBzaGFkZXJEZWY6IG51bGwgYXMgU2hhZGVyRXh0ZW5zaW9uIHwgbnVsbCxcblxuICAgIHNjaGVtYToge1xuICAgICAgICBuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIm5vaXNlXCIgfSxcbiAgICAgICAgdGFyZ2V0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBcIlwiIH0gIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNoYWRlckRlZjogU2hhZGVyRXh0ZW5zaW9uO1xuXG4gICAgICAgIHN3aXRjaCAodGhpcy5kYXRhLm5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJub2lzZVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vaXNlU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJ3YXJwXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gV2FycFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwid2FycC1wb3J0YWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBXYXJwUG9ydGFsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJsaXF1aWRtYXJibGVcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBMaXF1aWRNYXJibGVTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICAgICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gQmxlZXB5QmxvY2tzU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJnYWxheHlcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBHYWxheHlTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImxhY2V0dW5uZWxcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBMYWNlVHVubmVsU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJmaXJldHVubmVsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gRmlyZVR1bm5lbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBcbiAgICAgICAgICAgIGNhc2UgXCJtaXN0XCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTWlzdFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibWFyYmxlMVwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE1hcmJsZTFTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAvLyBhbiB1bmtub3duIG5hbWUgd2FzIHBhc3NlZCBpblxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcInVua25vd24gbmFtZSAnXCIgKyB0aGlzLmRhdGEubmFtZSArIFwiJyBwYXNzZWQgdG8gc2hhZGVyIGNvbXBvbmVudFwiKVxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE5vdEZvdW5kU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gXG5cbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIGxldCB1cGRhdGVNYXRlcmlhbHMgPSAoKSA9PntcbiAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEudGFyZ2V0XG4gICAgICAgICAgICBpZiAodGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMubWF0ZXJpYWxzID0gdXBkYXRlV2l0aFNoYWRlcihzaGFkZXJEZWYsIHRoaXMuZWwsIHRhcmdldCk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgaW5pdGlhbGl6ZXIgPSAoKSA9PntcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICBsZXQgZm4gPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZU1hdGVyaWFscygpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBmbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsIGZuKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB1cGRhdGVNYXRlcmlhbHMoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJvb3QgJiYgKHJvb3QgYXMgSFRNTEVsZW1lbnQpLmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIsIG9uY2UpO1xuICAgICAgICB0aGlzLnNoYWRlckRlZiA9IHNoYWRlckRlZlxuICAgIH0sXG5cblxuICB0aWNrOiBmdW5jdGlvbih0aW1lKSB7XG4gICAgaWYgKHRoaXMuc2hhZGVyRGVmID09IG51bGwgfHwgdGhpcy5tYXRlcmlhbHMgPT0gbnVsbCkgeyByZXR1cm4gfVxuXG4gICAgbGV0IHNoYWRlckRlZiA9IHRoaXMuc2hhZGVyRGVmXG4gICAgdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtzaGFkZXJEZWYudXBkYXRlVW5pZm9ybXModGltZSwgbWF0KX0pXG4gICAgLy8gc3dpdGNoICh0aGlzLmRhdGEubmFtZSkge1xuICAgIC8vICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgIC8vICAgICBjYXNlIFwiYmxlZXB5YmxvY2tzXCI6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyAgICAgZGVmYXVsdDpcbiAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgIC8vIH1cblxuICAgIC8vIGlmICh0aGlzLnNoYWRlcikge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImZyYWdtZW50IHNoYWRlcjpcIiwgdGhpcy5tYXRlcmlhbC5mcmFnbWVudFNoYWRlcilcbiAgICAvLyAgICAgdGhpcy5zaGFkZXIgPSBudWxsXG4gICAgLy8gfVxuICB9LFxufSlcblxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy8yYWViMDBiNjRhZTk1NjhmLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy81MGExYjZkMzM4Y2IyNDZlLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy9hZWFiMjA5MWU0YTUzZTlkLnBuZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy8wY2U0NmM0MjJmOTQ1YTk2LmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL2xjYWdtYWMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy82YTNlOGI0MzMyZDQ3Y2UyLmpwZ1wiIiwibGV0IFNJWkUgPSAxMDI0XG5sZXQgVEFSR0VUV0lEVEggPSBTSVpFXG5sZXQgVEFSR0VUSEVJR0hUID0gU0laRVxuXG53aW5kb3cuQVBQLndyaXRlV2F5UG9pbnRUZXh0dXJlcyA9IGZ1bmN0aW9uKG5hbWVzKSB7XG4gICAgaWYgKCAhQXJyYXkuaXNBcnJheSggbmFtZXMgKSApIHtcbiAgICAgICAgbmFtZXMgPSBbIG5hbWVzIF1cbiAgICB9XG5cbiAgICBmb3IgKCBsZXQgayA9IDA7IGsgPCBuYW1lcy5sZW5ndGg7IGsrKyApIHtcbiAgICAgICAgbGV0IHdheXBvaW50cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUobmFtZXNba10pXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAod2F5cG9pbnRzW2ldLmNvbXBvbmVudHMud2F5cG9pbnQpIHtcbiAgICAgICAgICAgICAgICBsZXQgY3ViZWNhbSA9IG51bGxcbiAgICAgICAgICAgICAgICAvLyBcbiAgICAgICAgICAgICAgICAvLyBmb3IgKGxldCBqID0gMDsgaiA8IHdheXBvaW50c1tpXS5vYmplY3QzRC5jaGlsZHJlbi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIC8vICAgICBpZiAod2F5cG9pbnRzW2ldLm9iamVjdDNELmNoaWxkcmVuW2pdIGluc3RhbmNlb2YgQ3ViZUNhbWVyYVdyaXRlcikge1xuICAgICAgICAgICAgICAgIC8vICAgICAgICAgY29uc29sZS5sb2coXCJmb3VuZCB3YXlwb2ludCB3aXRoIGN1YmVDYW1lcmEgJ1wiICsgbmFtZXNba10gKyBcIidcIilcbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGN1YmVjYW0gPSB3YXlwb2ludHNbaV0ub2JqZWN0M0QuY2hpbGRyZW5bal1cbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIC8vICAgICB9XG4gICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgIC8vIGlmICghY3ViZWNhbSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcImRpZG4ndCBmaW5kIHdheXBvaW50IHdpdGggY3ViZUNhbWVyYSAnXCIgKyBuYW1lc1trXSArIFwiJywgY3JlYXRpbmcgb25lLlwiKSAgICAgICAgICAgICAgICAgICAgLy8gY3JlYXRlIGEgY3ViZSBtYXAgY2FtZXJhIGFuZCByZW5kZXIgdGhlIHZpZXchXG4gICAgICAgICAgICAgICAgICAgIGlmIChUSFJFRS5SRVZJU0lPTiA8IDEyNSkgeyAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgY3ViZWNhbSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDAuMSwgMTAwMCwgU0laRSlcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1YmVSZW5kZXJUYXJnZXQgPSBuZXcgVEhSRUUuV2ViR0xDdWJlUmVuZGVyVGFyZ2V0KCBTSVpFLCB7IGVuY29kaW5nOiBUSFJFRS5zUkdCRW5jb2RpbmcsIGdlbmVyYXRlTWlwbWFwczogdHJ1ZSB9IClcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1YmVjYW0gPSBuZXcgQ3ViZUNhbWVyYVdyaXRlcigxLCAxMDAwMDAsIGN1YmVSZW5kZXJUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0ucG9zaXRpb24ueSA9IDEuNlxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB3YXlwb2ludHNbaV0ub2JqZWN0M0QuYWRkKGN1YmVjYW0pXG4gICAgICAgICAgICAgICAgICAgIGN1YmVjYW0udXBkYXRlKHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXIsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuQVBQLnNjZW5lLm9iamVjdDNEKVxuICAgICAgICAgICAgICAgIC8vIH0gICAgICAgICAgICAgICAgXG5cbiAgICAgICAgICAgICAgICBjdWJlY2FtLnNhdmVDdWJlTWFwU2lkZXMobmFtZXNba10pXG4gICAgICAgICAgICAgICAgd2F5cG9pbnRzW2ldLm9iamVjdDNELnJlbW92ZShjdWJlY2FtKVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5jbGFzcyBDdWJlQ2FtZXJhV3JpdGVyIGV4dGVuZHMgVEhSRUUuQ3ViZUNhbWVyYSB7XG5cbiAgICBjb25zdHJ1Y3RvciguLi5hcmdzKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3MpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gVEFSR0VUV0lEVEg7XG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IFRBUkdFVEhFSUdIVDtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLmdlbmVyYXRlTWlwbWFwcyA9IHRydWU7XG4gICAgICAgIC8vIHRoaXMucmVuZGVyVGFyZ2V0LnRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyTWlwTWFwTGluZWFyRmlsdGVyO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcblxuICAgICAgICAvLyB0aGlzLnVwZGF0ZSA9IGZ1bmN0aW9uKCByZW5kZXJlciwgc2NlbmUgKSB7XG5cbiAgICAgICAgLy8gICAgIGxldCBbIGNhbWVyYVBYLCBjYW1lcmFOWCwgY2FtZXJhUFksIGNhbWVyYU5ZLCBjYW1lcmFQWiwgY2FtZXJhTlogXSA9IHRoaXMuY2hpbGRyZW47XG5cbiAgICBcdC8vIFx0aWYgKCB0aGlzLnBhcmVudCA9PT0gbnVsbCApIHRoaXMudXBkYXRlTWF0cml4V29ybGQoKTtcblxuICAgIFx0Ly8gXHRpZiAoIHRoaXMucGFyZW50ID09PSBudWxsICkgdGhpcy51cGRhdGVNYXRyaXhXb3JsZCgpO1xuXG4gICAgXHQvLyBcdHZhciBjdXJyZW50UmVuZGVyVGFyZ2V0ID0gcmVuZGVyZXIuZ2V0UmVuZGVyVGFyZ2V0KCk7XG5cbiAgICBcdC8vIFx0dmFyIHJlbmRlclRhcmdldCA9IHRoaXMucmVuZGVyVGFyZ2V0O1xuICAgIFx0Ly8gXHQvL3ZhciBnZW5lcmF0ZU1pcG1hcHMgPSByZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHM7XG5cbiAgICBcdC8vIFx0Ly9yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMCApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFQWCApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCAxICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYU5YICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDIgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhUFkgKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMyApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFOWSApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCA0ICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYVBaICk7XG5cbiAgICBcdC8vIFx0Ly9yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBnZW5lcmF0ZU1pcG1hcHM7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDUgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhTlogKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIGN1cnJlbnRSZW5kZXJUYXJnZXQgKTtcbiAgICAgICAgLy8gfTtcblx0fVxuXG4gICAgc2F2ZUN1YmVNYXBTaWRlcyhzbHVnKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNjsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmNhcHR1cmUoc2x1ZywgaSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY2FwdHVyZSAoc2x1Zywgc2lkZSkge1xuICAgICAgICAvL3ZhciBpc1ZSRW5hYmxlZCA9IHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXIueHIuZW5hYmxlZDtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gd2luZG93LkFQUC5zY2VuZS5yZW5kZXJlcjtcbiAgICAgICAgLy8gRGlzYWJsZSBWUi5cbiAgICAgICAgLy9yZW5kZXJlci54ci5lbmFibGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyQ2FwdHVyZShzaWRlKTtcbiAgICAgICAgLy8gVHJpZ2dlciBmaWxlIGRvd25sb2FkLlxuICAgICAgICB0aGlzLnNhdmVDYXB0dXJlKHNsdWcsIHNpZGUpO1xuICAgICAgICAvLyBSZXN0b3JlIFZSLlxuICAgICAgICAvL3JlbmRlcmVyLnhyLmVuYWJsZWQgPSBpc1ZSRW5hYmxlZDtcbiAgICAgfVxuXG4gICAgcmVuZGVyQ2FwdHVyZSAoY3ViZVNpZGUpIHtcbiAgICAgICAgdmFyIGltYWdlRGF0YTtcbiAgICAgICAgdmFyIHBpeGVsczMgPSBuZXcgVWludDhBcnJheSg0ICogVEFSR0VUV0lEVEggKiBUQVJHRVRIRUlHSFQpO1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyO1xuXG4gICAgICAgIHJlbmRlcmVyLnJlYWRSZW5kZXJUYXJnZXRQaXhlbHModGhpcy5yZW5kZXJUYXJnZXQsIDAsIDAsIFRBUkdFVFdJRFRILFRBUkdFVEhFSUdIVCwgcGl4ZWxzMywgY3ViZVNpZGUpO1xuXG4gICAgICAgIC8vcGl4ZWxzMyA9IHRoaXMuZmxpcFBpeGVsc1ZlcnRpY2FsbHkocGl4ZWxzMywgVEFSR0VUV0lEVEgsIFRBUkdFVEhFSUdIVCk7XG4gICAgICAgIHZhciBwaXhlbHM0ID0gcGl4ZWxzMzsgIC8vdGhpcy5jb252ZXJ0M3RvNChwaXhlbHMzLCBUQVJHRVRXSURUSCwgVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgaW1hZ2VEYXRhID0gbmV3IEltYWdlRGF0YShuZXcgVWludDhDbGFtcGVkQXJyYXkocGl4ZWxzNCksIFRBUkdFVFdJRFRILCBUQVJHRVRIRUlHSFQpO1xuXG4gICAgICAgIC8vIENvcHkgcGl4ZWxzIGludG8gY2FudmFzLlxuXG4gICAgICAgIC8vIGNvdWxkIHVzZSBkcmF3SW1hZ2UgaW5zdGVhZCwgdG8gc2NhbGUsIGlmIHdlIHdhbnRcbiAgICAgICAgdGhpcy5jdHgucHV0SW1hZ2VEYXRhKGltYWdlRGF0YSwgMCwgMCk7XG4gICAgfVxuXG4gICAgZmxpcFBpeGVsc1ZlcnRpY2FsbHkgKHBpeGVscywgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgZmxpcHBlZFBpeGVscyA9IHBpeGVscy5zbGljZSgwKTtcbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCB3aWR0aDsgKyt4KSB7XG4gICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBoZWlnaHQ7ICsreSkge1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIHkgKiB3aWR0aCAqIDNdID0gcGl4ZWxzW3ggKiAzICsgKGhlaWdodCAtIHkgLSAxKSAqIHdpZHRoICogM107XG4gICAgICAgICAgICBmbGlwcGVkUGl4ZWxzW3ggKiAzICsgMSArIHkgKiB3aWR0aCAqIDNdID0gcGl4ZWxzW3ggKiAzICsgMSArIChoZWlnaHQgLSB5IC0gMSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDIgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDIgKyAoaGVpZ2h0IC0geSAtIDEpICogd2lkdGggKiAzXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZsaXBwZWRQaXhlbHM7XG4gICAgfVxuXG4gICAgY29udmVydDN0bzQgKHBpeGVscywgd2lkdGgsIGhlaWdodCkge1xuICAgICAgICB2YXIgbmV3UGl4ZWxzID0gbmV3IFVpbnQ4QXJyYXkoNCAqIFRBUkdFVFdJRFRIICogVEFSR0VUSEVJR0hUKTtcblxuICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IHdpZHRoOyArK3gpIHtcbiAgICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IGhlaWdodDsgKyt5KSB7XG4gICAgICAgICAgICBuZXdQaXhlbHNbeCAqIDQgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMSArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMSArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMiArIHkgKiB3aWR0aCAqIDRdID0gcGl4ZWxzW3ggKiAzICsgMiArIHkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgMyArIHkgKiB3aWR0aCAqIDRdID0gMjU1O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3UGl4ZWxzO1xuICAgIH1cblxuXG4gICAgc2lkZXMgPSBbXG4gICAgICAgIFwiUmlnaHRcIiwgXCJMZWZ0XCIsIFwiVG9wXCIsIFwiQm90dG9tXCIsIFwiRnJvbnRcIiwgXCJCYWNrXCJcbiAgICBdXG5cbiAgICBzYXZlQ2FwdHVyZSAoc2x1Zywgc2lkZSkge1xuICAgICAgICB0aGlzLmNhbnZhcy50b0Jsb2IoIChibG9iKSA9PiB7XG4gICAgICAgICAgICB2YXIgZmlsZU5hbWUgPSBzbHVnICsgJy0nICsgdGhpcy5zaWRlc1tzaWRlXSArICcucG5nJztcbiAgICAgICAgICAgIHZhciBsaW5rRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICB2YXIgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgICAgIGxpbmtFbC5ocmVmID0gdXJsO1xuICAgICAgICAgICAgbGlua0VsLnNldEF0dHJpYnV0ZSgnZG93bmxvYWQnLCBmaWxlTmFtZSk7XG4gICAgICAgICAgICBsaW5rRWwuaW5uZXJIVE1MID0gJ2Rvd25sb2FkaW5nLi4uJztcbiAgICAgICAgICAgIGxpbmtFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaW5rRWwpO1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbGlua0VsLmNsaWNrKCk7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChsaW5rRWwpO1xuICAgICAgICAgICAgfSwgMSk7XG4gICAgICAgIH0sICdpbWFnZS9wbmcnKTtcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEN1YmVDYW1lcmFXcml0ZXIiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogQmlkaXJlY3Rpb25hbCBzZWUtdGhyb3VnaCBwb3J0YWwuIFR3byBwb3J0YWxzIGFyZSBwYWlyZWQgYnkgY29sb3IuXG4gKlxuICogVXNhZ2VcbiAqID09PT09PT1cbiAqIEFkZCB0d28gaW5zdGFuY2VzIG9mIGBwb3J0YWwuZ2xiYCB0byB0aGUgU3Bva2Ugc2NlbmUuXG4gKiBUaGUgbmFtZSBvZiBlYWNoIGluc3RhbmNlIHNob3VsZCBsb29rIGxpa2UgXCJzb21lLWRlc2NyaXB0aXZlLWxhYmVsX19jb2xvclwiXG4gKiBBbnkgdmFsaWQgVEhSRUUuQ29sb3IgYXJndW1lbnQgaXMgYSB2YWxpZCBjb2xvciB2YWx1ZS5cbiAqIFNlZSBoZXJlIGZvciBleGFtcGxlIGNvbG9yIG5hbWVzIGh0dHBzOi8vd3d3Lnczc2Nob29scy5jb20vY3NzcmVmL2Nzc19jb2xvcnMuYXNwXG4gKlxuICogRm9yIGV4YW1wbGUsIHRvIG1ha2UgYSBwYWlyIG9mIGNvbm5lY3RlZCBibHVlIHBvcnRhbHMsXG4gKiB5b3UgY291bGQgbmFtZSB0aGVtIFwicG9ydGFsLXRvX19ibHVlXCIgYW5kIFwicG9ydGFsLWZyb21fX2JsdWVcIlxuICovXG5pbXBvcnQge3Z1ZUNvbXBvbmVudHMgYXMgaHRtbENvbXBvbmVudHN9IGZyb20gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcbi8vICBpbXBvcnQgXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIjtcbi8vIGxldCBodG1sQ29tcG9uZW50cyA9IHdpbmRvdy5BUFAudnVlQXBwc1xuXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcbi8vIGltcG9ydCB2ZXJ0ZXhTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwudmVydC5qcydcbi8vIGltcG9ydCBmcmFnbWVudFNoYWRlciBmcm9tICcuLi9zaGFkZXJzL3BvcnRhbC5mcmFnLmpzJ1xuLy8gaW1wb3J0IHNub2lzZSBmcm9tICcuLi9zaGFkZXJzL3Nub2lzZSdcblxuaW1wb3J0IHsgc2hvd1JlZ2lvbkZvck9iamVjdCwgaGlkZXJSZWdpb25Gb3JPYmplY3QgfSBmcm9tICcuL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCB7IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQgfSBmcm9tICcuLi91dGlscy9zY2VuZS1ncmFwaCdcbmltcG9ydCB7IHVwZGF0ZVdpdGhTaGFkZXIgfSBmcm9tICcuL3NoYWRlcidcbmltcG9ydCB7IFdhcnBQb3J0YWxTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAtcG9ydGFsLmpzJ1xuXG5pbXBvcnQgZ29sZGNvbG9yIGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0NPTE9SLmpwZydcbmltcG9ydCBnb2xkRGlzcGxhY2VtZW50IGZyb20gJy4uL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0RJU1AuanBnJ1xuaW1wb3J0IGdvbGRnbG9zcyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9nbG9zc2luZXNzLnBuZydcbmltcG9ydCBnb2xkbm9ybSBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9OUk0uanBnJ1xuaW1wb3J0IGdvbGRhbyBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9PQ0MuanBnJ1xuXG5pbXBvcnQgQ3ViZUNhbWVyYVdyaXRlciBmcm9tIFwiLi4vdXRpbHMvd3JpdGVDdWJlTWFwLmpzXCI7XG5cbmltcG9ydCB7IHJlcGxhY2VNYXRlcmlhbCBhcyByZXBsYWNlV2l0aFNoYWRlcn0gZnJvbSAnLi9zaGFkZXInXG5pbXBvcnQgeyBNYXRyaXg0IH0gZnJvbSBcInRocmVlXCI7XG5cbmNvbnN0IHdvcmxkUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGRDYW1lcmFQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZERpciA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkUXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKClcbmNvbnN0IG1hdDQgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG5cbi8vIGxvYWQgYW5kIHNldHVwIGFsbCB0aGUgYml0cyBvZiB0aGUgdGV4dHVyZXMgZm9yIHRoZSBkb29yXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG5jb25zdCBkb29yTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xuICAgIGNvbG9yOiAweGZmZmZmZixcbiAgICBtZXRhbG5lc3M6IDAuMCxcbiAgICByb3VnaG5lc3M6IDAuMCwgXG4gICAgLy9lbWlzc2l2ZUludGVuc2l0eTogMVxufSlcbmNvbnN0IGRvb3JtYXRlcmlhbFkgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xuICAgIGNvbG9yOiAweGZmZmZmZixcbiAgICBtZXRhbG5lc3M6IDAuMCxcbiAgICByb3VnaG5lc3M6IDAsIFxuICAgIC8vZW1pc3NpdmVJbnRlbnNpdHk6IDFcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRjb2xvciwgKGNvbG9yKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLm1hcCA9IGNvbG9yO1xuICAgIGNvbG9yLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBjb2xvci53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGNvbG9yLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcbmxvYWRlci5sb2FkKGdvbGRjb2xvciwgKGNvbG9yKSA9PiB7XG4gICAgLy9jb2xvciA9IGNvbG9yLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLm1hcCA9IGNvbG9yO1xuICAgIGNvbG9yLnJlcGVhdC5zZXQoMSwxKVxuICAgIGNvbG9yLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBjb2xvci53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGREaXNwbGFjZW1lbnQsIChkaXNwKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLmJ1bXBNYXAgPSBkaXNwO1xuICAgIGRpc3AucmVwZWF0LnNldCgxLDI1KVxuICAgIGRpc3Aud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkaXNwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZERpc3BsYWNlbWVudCwgKGRpc3ApID0+IHtcbiAgICAvL2Rpc3AgPSBkaXNwLmNsb25lKClcbiAgICBkb29ybWF0ZXJpYWxZLmJ1bXBNYXAgPSBkaXNwO1xuICAgIGRpc3AucmVwZWF0LnNldCgxLDEpXG4gICAgZGlzcC53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZGlzcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRnbG9zcywgKGdsb3NzKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLnJvdWdobmVzcyA9IGdsb3NzXG4gICAgZ2xvc3MucmVwZWF0LnNldCgxLDI1KVxuICAgIGdsb3NzLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZ2xvc3Mud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkZ2xvc3MsIChnbG9zcykgPT4ge1xuICAgIC8vZ2xvc3MgPSBnbG9zcy5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5yb3VnaG5lc3MgPSBnbG9zc1xuICAgIGdsb3NzLnJlcGVhdC5zZXQoMSwxKVxuICAgIGdsb3NzLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBnbG9zcy53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG4gICAgICAgICBcbmxvYWRlci5sb2FkKGdvbGRhbywgKGFvKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLmFvTWFwID0gYW9cbiAgICBhby5yZXBlYXQuc2V0KDEsMjUpXG4gICAgYW8ud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBhby53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG4gICAgICAgICBcbmxvYWRlci5sb2FkKGdvbGRhbywgKGFvKSA9PiB7XG4gICAgLy8gYW8gPSBhby5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5hb01hcCA9IGFvXG4gICAgYW8ucmVwZWF0LnNldCgxLDEpXG4gICAgYW8ud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGFvLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBkb29ybWF0ZXJpYWxZLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZG5vcm0sIChub3JtKSA9PiB7XG4gICAgZG9vck1hdGVyaWFsLm5vcm1hbE1hcCA9IG5vcm07XG4gICAgbm9ybS5yZXBlYXQuc2V0KDEsMjUpXG4gICAgbm9ybS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vcm0ud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkbm9ybSwgKG5vcm0pID0+IHtcbiAgICAvLyBub3JtID0gbm9ybS5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5ub3JtYWxNYXAgPSBub3JtO1xuICAgIG5vcm0ucmVwZWF0LnNldCgxLDEpXG4gICAgbm9ybS53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgbm9ybS53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbi8vIC8vIG1hcCBhbGwgbWF0ZXJpYWxzIHZpYSBhIGNhbGxiYWNrLiAgVGFrZW4gZnJvbSBodWJzIG1hdGVyaWFscy11dGlsc1xuLy8gZnVuY3Rpb24gbWFwTWF0ZXJpYWxzKG9iamVjdDNELCBmbikge1xuLy8gICAgIGxldCBtZXNoID0gb2JqZWN0M0QgXG4vLyAgICAgaWYgKCFtZXNoLm1hdGVyaWFsKSByZXR1cm47XG4gIFxuLy8gICAgIGlmIChBcnJheS5pc0FycmF5KG1lc2gubWF0ZXJpYWwpKSB7XG4vLyAgICAgICByZXR1cm4gbWVzaC5tYXRlcmlhbC5tYXAoZm4pO1xuLy8gICAgIH0gZWxzZSB7XG4vLyAgICAgICByZXR1cm4gZm4obWVzaC5tYXRlcmlhbCk7XG4vLyAgICAgfVxuLy8gfVxuICBcbmNvbnN0IG9uY2UgPSB7XG4gICAgb25jZSA6IHRydWVcbn07XG5cbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgncG9ydGFsJywge1xuICBkZXBlbmRlbmNpZXM6IFsnZmFkZXItcGx1cyddLFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyID0gdGhpcy5lbC5zeXN0ZW1zWydodWJzLXN5c3RlbXMnXS5jaGFyYWN0ZXJDb250cm9sbGVyXG4gICAgdGhpcy5mYWRlciA9IHRoaXMuZWwuc3lzdGVtc1snZmFkZXItcGx1cyddXG4gICAgLy8gdGhpcy5yb29tRGF0YSA9IG51bGxcbiAgICB0aGlzLndhaXRGb3JGZXRjaCA9IHRoaXMud2FpdEZvckZldGNoLmJpbmQodGhpcylcblxuICAgIC8vIGlmIHRoZSB1c2VyIGlzIGxvZ2dlZCBpbiwgd2Ugd2FudCB0byByZXRyaWV2ZSB0aGVpciB1c2VyRGF0YSBmcm9tIHRoZSB0b3AgbGV2ZWwgc2VydmVyXG4gICAgLy8gaWYgKHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMgJiYgd2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbiAmJiAhd2luZG93LkFQUC51c2VyRGF0YSkge1xuICAgIC8vICAgICB0aGlzLmZldGNoUm9vbURhdGEoKVxuICAgIC8vIH1cbiAgfSxcbi8vICAgZmV0Y2hSb29tRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkge1xuLy8gICAgIHZhciBwYXJhbXMgPSB7dG9rZW46IHdpbmRvdy5BUFAuc3RvcmUuc3RhdGUuY3JlZGVudGlhbHMudG9rZW4sXG4vLyAgICAgICAgICAgICAgICAgICByb29tX2lkOiB3aW5kb3cuQVBQLmh1YkNoYW5uZWwuaHViSWR9XG5cbi8vICAgICBjb25zdCBvcHRpb25zID0ge307XG4vLyAgICAgb3B0aW9ucy5oZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcbi8vICAgICBvcHRpb25zLmhlYWRlcnMuc2V0KFwiQXV0aG9yaXphdGlvblwiLCBgQmVhcmVyICR7cGFyYW1zfWApO1xuLy8gICAgIG9wdGlvbnMuaGVhZGVycy5zZXQoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuLy8gICAgIGF3YWl0IGZldGNoKFwiaHR0cHM6Ly9yZWFsaXR5bWVkaWEuZGlnaXRhbC91c2VyRGF0YVwiLCBvcHRpb25zKVxuLy8gICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS5qc29uKCkpXG4vLyAgICAgICAgIC50aGVuKGRhdGEgPT4ge1xuLy8gICAgICAgICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzOicsIGRhdGEpO1xuLy8gICAgICAgICAgIHRoaXMucm9vbURhdGEgPSBkYXRhO1xuLy8gICAgIH0pXG4vLyAgICAgdGhpcy5yb29tRGF0YS50ZXh0dXJlcyA9IFtdXG4vLyAgIH0sXG4gIGdldFJvb21VUkw6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAgIGxldCBodWJfaWQgPSBhd2FpdCB0aGlzLmdldFJvb21IdWJJZChudW1iZXIpXG5cbiAgICAgIGxldCB1cmwgPSB3aW5kb3cuU1NPLnVzZXJJbmZvLnJvb21zLmxlbmd0aCA+IG51bWJlciA/IFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIGh1Yl9pZCA6IG51bGw7XG4gICAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldFJvb21IdWJJZDogYXN5bmMgZnVuY3Rpb24gKG51bWJlcikge1xuICAgIHRoaXMud2FpdEZvckZldGNoKClcbiAgICByZXR1cm4gd2luZG93LlNTTy51c2VySW5mby5yb29tc1tudW1iZXJdXG4gIH0sXG4gIGdldEN1YmVNYXA6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIsIHdheXBvaW50KSB7XG4gICAgICB0aGlzLndhaXRGb3JGZXRjaCgpXG5cbiAgICAgIGlmICghd2F5cG9pbnQgfHwgd2F5cG9pbnQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICB3YXlwb2ludCA9IFwic3RhcnRcIlxuICAgICAgfVxuICAgICAgbGV0IHVybHMgPSBbXCJSaWdodFwiLFwiTGVmdFwiLFwiVG9wXCIsXCJCb3R0b21cIixcIkZyb250XCIsXCJCYWNrXCJdLm1hcChlbCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS9yb29tUGFub3MvXCIgKyBudW1iZXIudG9TdHJpbmcoKSArIFwiL1wiICsgd2F5cG9pbnQgKyBcIi1cIiArIGVsICsgXCIucG5nXCJcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdXJsc1xuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5jdWJlbWFwcy5sZW5ndGggPiBudW1iZXIgPyB0aGlzLnJvb21EYXRhLmN1YmVtYXBzW251bWJlcl0gOiBudWxsO1xuICB9LFxuICBnZXRDdWJlTWFwQnlOYW1lOiBhc3luYyBmdW5jdGlvbiAobmFtZSwgd2F5cG9pbnQpIHtcbiAgICBpZiAoIXdheXBvaW50IHx8IHdheXBvaW50Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHdheXBvaW50ID0gXCJzdGFydFwiXG4gICAgfVxuICAgIGxldCB1cmxzID0gW1wiUmlnaHRcIixcIkxlZnRcIixcIlRvcFwiLFwiQm90dG9tXCIsXCJGcm9udFwiLFwiQmFja1wiXS5tYXAoZWwgPT4ge1xuICAgICAgICByZXR1cm4gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9kYXRhL3Jvb21QYW5vcy9cIiArIG5hbWUgKyBcIi9cIiArIHdheXBvaW50ICsgXCItXCIgKyBlbCArIFwiLnBuZ1wiXG4gICAgfSlcbiAgICByZXR1cm4gdXJsc1xuICAgIC8vcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcbiAgd2FpdEZvckZldGNoOiBmdW5jdGlvbiAoKSB7XG4gICAgIGlmICh3aW5kb3cuU1NPLnVzZXJJbmZvKSByZXR1cm5cbiAgICAgc2V0VGltZW91dCh0aGlzLndhaXRGb3JGZXRjaCwgMTAwKTsgLy8gdHJ5IGFnYWluIGluIDEwMCBtaWxsaXNlY29uZHNcbiAgfSxcbiAgdGVsZXBvcnRUbzogYXN5bmMgZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHRoaXMudGVsZXBvcnRpbmcgPSB0cnVlXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlT3V0KClcbiAgICAvLyBTY2FsZSBzY3Jld3MgdXAgdGhlIHdheXBvaW50IGxvZ2ljLCBzbyBqdXN0IHNlbmQgcG9zaXRpb24gYW5kIG9yaWVudGF0aW9uXG4gICAgb2JqZWN0LmdldFdvcmxkUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgb2JqZWN0LmdldFdvcmxkRGlyZWN0aW9uKHdvcmxkRGlyKVxuICAgIG9iamVjdC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkUG9zKVxuICAgIHdvcmxkUG9zLmFkZCh3b3JsZERpci5tdWx0aXBseVNjYWxhcigzKSkgLy8gVGVsZXBvcnQgaW4gZnJvbnQgb2YgdGhlIHBvcnRhbCB0byBhdm9pZCBpbmZpbml0ZSBsb29wXG4gICAgbWF0NC5tYWtlUm90YXRpb25Gcm9tUXVhdGVybmlvbih3b3JsZFF1YXQpXG4gICAgbWF0NC5zZXRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAvLyBVc2luZyB0aGUgY2hhcmFjdGVyQ29udHJvbGxlciBlbnN1cmVzIHdlIGRvbid0IHN0cmF5IGZyb20gdGhlIG5hdm1lc2hcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIudHJhdmVsQnlXYXlwb2ludChtYXQ0LCB0cnVlLCBmYWxzZSlcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVJbigpXG4gICAgdGhpcy50ZWxlcG9ydGluZyA9IGZhbHNlXG4gIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3BvcnRhbCcsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgcG9ydGFsVHlwZTogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgICAgIHBvcnRhbFRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgICAgIHNlY29uZGFyeVRhcmdldDogeyBkZWZhdWx0OiBcIlwiIH0sXG4gICAgICAgIGNvbG9yOiB7IHR5cGU6ICdjb2xvcicsIGRlZmF1bHQ6IG51bGwgfSxcbiAgICAgICAgbWF0ZXJpYWxUYXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGwgfSxcbiAgICAgICAgZHJhd0Rvb3I6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZWZhdWx0OiBmYWxzZSB9LFxuICAgICAgICB0ZXh0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsfSxcbiAgICAgICAgdGV4dFBvc2l0aW9uOiB7IHR5cGU6ICd2ZWMzJyB9LFxuICAgICAgICB0ZXh0U2l6ZTogeyB0eXBlOiAndmVjMicgfSxcbiAgICAgICAgdGV4dFNjYWxlOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAxIH1cbiAgICB9LFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBURVNUSU5HXG4gICAgICAgIC8vdGhpcy5kYXRhLmRyYXdEb29yID0gdHJ1ZVxuICAgICAgICAvLyB0aGlzLmRhdGEubWFpblRleHQgPSBcIlBvcnRhbCB0byB0aGUgQWJ5c3NcIlxuICAgICAgICAvLyB0aGlzLmRhdGEuc2Vjb25kYXJ5VGV4dCA9IFwiVG8gdmlzaXQgdGhlIEFieXNzLCBnbyB0aHJvdWdoIHRoZSBkb29yIVwiXG5cbiAgICAgICAgLy8gQS1GcmFtZSBpcyBzdXBwb3NlZCB0byBkbyB0aGlzIGJ5IGRlZmF1bHQgYnV0IGRvZXNuJ3Qgc2VlbSB0bz9cbiAgICAgICAgdGhpcy5zeXN0ZW0gPSB3aW5kb3cuQVBQLnNjZW5lLnN5c3RlbXMucG9ydGFsIFxuXG4gICAgICAgIHRoaXMudXBkYXRlUG9ydGFsID0gdGhpcy51cGRhdGVQb3J0YWwuYmluZCh0aGlzKVxuXG4gICAgICAgIGlmICh0aGlzLmRhdGEucG9ydGFsVHlwZS5sZW5ndGggPiAwICkge1xuICAgICAgICAgICAgdGhpcy5zZXRQb3J0YWxJbmZvKHRoaXMuZGF0YS5wb3J0YWxUeXBlLCB0aGlzLmRhdGEucG9ydGFsVGFyZ2V0LCB0aGlzLmRhdGEuY29sb3IpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDApIHtcbiAgICAgICAgICAgIC8vIHBhcnNlIHRoZSBuYW1lIHRvIGdldCBwb3J0YWwgdHlwZSwgdGFyZ2V0LCBhbmQgY29sb3JcbiAgICAgICAgICAgIHRoaXMucGFyc2VOb2RlTmFtZSgpXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMucG9ydGFsVGl0bGUgPSBudWxsO1xuXG4gICAgICAgIC8vIHdhaXQgdW50aWwgdGhlIHNjZW5lIGxvYWRzIHRvIGZpbmlzaC4gIFdlIHdhbnQgdG8gbWFrZSBzdXJlIGV2ZXJ5dGhpbmdcbiAgICAgICAgLy8gaXMgaW5pdGlhbGl6ZWRcbiAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgIHJvb3QgJiYgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIChldikgPT4geyBcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpXG4gICAgICAgIH0sIG9uY2UpO1xuICAgIH0sXG5cbiAgICBpbml0aWFsaXplOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAvLyAgIHRyYW5zcGFyZW50OiB0cnVlLFxuICAgICAgICAvLyAgIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUsXG4gICAgICAgIC8vICAgdW5pZm9ybXM6IHtcbiAgICAgICAgLy8gICAgIGN1YmVNYXA6IHsgdmFsdWU6IG5ldyBUSFJFRS5UZXh0dXJlKCkgfSxcbiAgICAgICAgLy8gICAgIHRpbWU6IHsgdmFsdWU6IDAgfSxcbiAgICAgICAgLy8gICAgIHJhZGl1czogeyB2YWx1ZTogMCB9LFxuICAgICAgICAvLyAgICAgcmluZ0NvbG9yOiB7IHZhbHVlOiB0aGlzLmNvbG9yIH0sXG4gICAgICAgIC8vICAgfSxcbiAgICAgICAgLy8gICB2ZXJ0ZXhTaGFkZXIsXG4gICAgICAgIC8vICAgZnJhZ21lbnRTaGFkZXI6IGBcbiAgICAgICAgLy8gICAgICR7c25vaXNlfVxuICAgICAgICAvLyAgICAgJHtmcmFnbWVudFNoYWRlcn1cbiAgICAgICAgLy8gICBgLFxuICAgICAgICAvLyB9KVxuXG4gICAgICAgIC8vIEFzc3VtZSB0aGF0IHRoZSBvYmplY3QgaGFzIGEgcGxhbmUgZ2VvbWV0cnlcbiAgICAgICAgLy9jb25zdCBtZXNoID0gdGhpcy5lbC5nZXRPckNyZWF0ZU9iamVjdDNEKCdtZXNoJylcbiAgICAgICAgLy9tZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzID0gbnVsbFxuICAgICAgICB0aGlzLnJhZGl1cyA9IDAuMlxuICAgICAgICB0aGlzLmN1YmVNYXAgPSBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKVxuXG4gICAgICAgIC8vIGdldCB0aGUgb3RoZXIgYmVmb3JlIGNvbnRpbnVpbmdcbiAgICAgICAgdGhpcy5vdGhlciA9IGF3YWl0IHRoaXMuZ2V0T3RoZXIoKVxuXG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhbmltYXRpb25fX3BvcnRhbCcsIHtcbiAgICAgICAgICAgIHByb3BlcnR5OiAnY29tcG9uZW50cy5wb3J0YWwucmFkaXVzJyxcbiAgICAgICAgICAgIGR1cjogNzAwLFxuICAgICAgICAgICAgZWFzaW5nOiAnZWFzZUluT3V0Q3ViaWMnLFxuICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25iZWdpbicsICgpID0+ICh0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB0cnVlKSlcbiAgICAgICAgLy8gdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25jb21wbGV0ZV9fcG9ydGFsJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9ICF0aGlzLmlzQ2xvc2VkKCkpKVxuXG4gICAgICAgIC8vIGdvaW5nIHRvIHdhbnQgdG8gdHJ5IGFuZCBtYWtlIHRoZSBvYmplY3QgdGhpcyBwb3J0YWwgaXMgb24gY2xpY2thYmxlXG4gICAgICAgIC8vIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywnJylcbiAgICAgICAgLy8gdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7c2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlfSlcbiAgICAgICAgLy90aGlzLmVsLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAvLyBvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBwb3J0YWwgbW92ZW1lbnQgXG4gICAgICAgIC8vdGhpcy5mb2xsb3dQb3J0YWwgPSB0aGlzLmZvbGxvd1BvcnRhbC5iaW5kKHRoaXMpXG4gICAgICAgIC8vdGhpcy5lbC5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuZm9sbG93UG9ydGFsKVxuXG4gICAgICAgIGlmICggdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdIHx8IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdICkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cFBvcnRhbCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kYXRhLmRyYXdEb29yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgZm4pXG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cERvb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKClcbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHVwZGF0ZVBvcnRhbDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBuby1vcCBmb3IgcG9ydGFscyB0aGF0IHVzZSBwcmUtcmVuZGVyZWQgY3ViZSBtYXBzXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiB8fCB0aGlzLnBvcnRhbFR5cGUgPT0gMykgeyBcbiAgICAgICAgICAgIC8vdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsICgpID0+IHtcbiAgICAgICAgICAgICAgICBzaG93UmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhLnVwZGF0ZSh0aGlzLmVsLnNjZW5lRWwucmVuZGVyZXIsIHRoaXMuZWwuc2NlbmVFbC5vYmplY3QzRClcbiAgICAgICAgICAgICAgICAvLyB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICBoaWRlclJlZ2lvbkZvck9iamVjdCh0aGlzLmVsKVxuICAgICAgICAgICAgLy99LCBvbmNlKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHNldHVwUG9ydGFsOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGdldCByaWQgb2YgaW50ZXJhY3Rpdml0eVxuICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwiaXMtcmVtb3RlLWhvdmVyLXRhcmdldFwiKVxuICAgICAgICBcbiAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMuZGF0YS5tYXRlcmlhbFRhcmdldFxuICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgIFxuICAgICAgICB0aGlzLm1hdGVyaWFscyA9IHVwZGF0ZVdpdGhTaGFkZXIoV2FycFBvcnRhbFNoYWRlciwgdGhpcy5lbCwgdGFyZ2V0LCB7XG4gICAgICAgICAgICByYWRpdXM6IHRoaXMucmFkaXVzLFxuICAgICAgICAgICAgcmluZ0NvbG9yOiB0aGlzLmNvbG9yLFxuICAgICAgICAgICAgY3ViZU1hcDogdGhpcy5jdWJlTWFwLFxuICAgICAgICAgICAgaW52ZXJ0V2FycENvbG9yOiB0aGlzLnBvcnRhbFR5cGUgPT0gMSA/IDEgOiAwXG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAxKSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwKHRoaXMucG9ydGFsVGFyZ2V0LCB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgICAgICAvL2NvbnN0IHVybHMgPSBbY3ViZU1hcFBvc1gsIGN1YmVNYXBOZWdYLCBjdWJlTWFwUG9zWSwgY3ViZU1hcE5lZ1ksIGN1YmVNYXBQb3NaLCBjdWJlTWFwTmVnWl07XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuQ3ViZVRleHR1cmVMb2FkZXIoKS5sb2FkKHVybHMsIHJlc29sdmUsIHVuZGVmaW5lZCwgcmVqZWN0KVxuICAgICAgICAgICAgICAgICkudGhlbih0ZXh0dXJlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVNYXAgPSB0ZXh0dXJlXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUpKSAgICBcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDQpIHtcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldEN1YmVNYXBCeU5hbWUodGhpcy5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQpLnRoZW4oIHVybHMgPT4ge1xuICAgICAgICAgICAgICAgIC8vY29uc3QgdXJscyA9IFtjdWJlTWFwUG9zWCwgY3ViZU1hcE5lZ1gsIGN1YmVNYXBQb3NZLCBjdWJlTWFwTmVnWSwgY3ViZU1hcFBvc1osIGN1YmVNYXBOZWdaXTtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkN1YmVUZXh0dXJlTG9hZGVyKCkubG9hZCh1cmxzLCByZXNvbHZlLCB1bmRlZmluZWQsIHJlamVjdClcbiAgICAgICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGV4dHVyZVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyIHx8IHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7IFxuICAgICAgICAgICAgaWYgKFRIUkVFLlJFVklTSU9OIDwgMTI1KSB7ICAgXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMC4xLCAxMDAwLCAxMDI0KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdWJlUmVuZGVyVGFyZ2V0ID0gbmV3IFRIUkVFLldlYkdMQ3ViZVJlbmRlclRhcmdldCggMTAyNCwgeyBlbmNvZGluZzogVEhSRUUuc1JHQkVuY29kaW5nLCBnZW5lcmF0ZU1pcG1hcHM6IHRydWUgfSApXG4gICAgICAgICAgICAgICAgdGhpcy5jdWJlQ2FtZXJhID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMSwgMTAwMDAwLCBjdWJlUmVuZGVyVGFyZ2V0KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3RoaXMuY3ViZUNhbWVyYS5yb3RhdGVZKE1hdGguUEkpIC8vIEZhY2UgZm9yd2FyZHNcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikge1xuICAgICAgICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgICAgICAgICAvLyB0aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmUgXG4gICAgICAgICAgICAgICAgLy90aGlzLm90aGVyLmNvbXBvbmVudHMucG9ydGFsLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCB3YXlwb2ludCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUodGhpcy5wb3J0YWxUYXJnZXQpXG4gICAgICAgICAgICAgICAgaWYgKHdheXBvaW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnQgPSB3YXlwb2ludC5pdGVtKDApXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS5wb3NpdGlvbi55ID0gMS42XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnQub2JqZWN0M0QuYWRkKHRoaXMuY3ViZUNhbWVyYSlcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7bWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVDYW1lcmEucmVuZGVyVGFyZ2V0LnRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy51cGRhdGVQb3J0YWwoKVxuICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ3VwZGF0ZVBvcnRhbHMnLCB0aGlzLnVwZGF0ZVBvcnRhbClcbiAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCdtb2RlbC1sb2FkZWQnLCB0aGlzLnVwZGF0ZVBvcnRhbClcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByb3QgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpXG4gICAgICAgIGxldCBzY2FsZVcgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG4gICAgICAgIGxldCBwb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4V29ybGQuZGVjb21wb3NlKHBvcywgcm90LCBzY2FsZVcpXG4gICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuXG4gICAgICAgIC8vIGxldCBzY2FsZVggPSBzY2FsZU0ueCAqIHNjYWxlSS54XG4gICAgICAgIC8vIGxldCBzY2FsZVkgPSBzY2FsZU0ueSAqIHNjYWxlSS55XG4gICAgICAgIC8vIGxldCBzY2FsZVogPSBzY2FsZU0ueiAqIHNjYWxlSS56XG5cbiAgICAgICAgLy8gdGhpcy5wb3J0YWxXaWR0aCA9IHNjYWxlWCAvIDJcbiAgICAgICAgLy8gdGhpcy5wb3J0YWxIZWlnaHQgPSBzY2FsZVkgLyAyXG5cbiAgICAgICAgLy8gb2Zmc2V0IHRvIGNlbnRlciBvZiBwb3J0YWwgYXNzdW1pbmcgd2Fsa2luZyBvbiBncm91bmRcbiAgICAgICAgLy8gdGhpcy5Zb2Zmc2V0ID0gLSh0aGlzLmVsLm9iamVjdDNELnBvc2l0aW9uLnkgLSAxLjYpXG4gICAgICAgIHRoaXMuWW9mZnNldCA9IC0oKHNjYWxlVy55ICogc2NhbGVNLnkpLzIgLSAxLjYpXG4gICAgICAgIFxuICAgICAgICB0aGlzLmNsb3NlKClcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3Byb3hpbWl0eS1ldmVudHMnLCB7IHJhZGl1czogNCwgWW9mZnNldDogdGhpcy5Zb2Zmc2V0IH0pXG4gICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5ZW50ZXInLCAoKSA9PiB0aGlzLm9wZW4oKSlcbiAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKCdwcm94aW1pdHlsZWF2ZScsICgpID0+IHRoaXMuY2xvc2UoKSlcblxuICAgICAgICB0aGlzLmVsLnNldE9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgXG4gICAgICAgIGlmICh0aGlzLmRhdGEudGV4dCAmJiB0aGlzLmRhdGEudGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB2YXIgdGl0bGVTY3JpcHREYXRhID0ge1xuICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLmRhdGEudGV4dFNpemUueCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuZGF0YS50ZXh0U2l6ZS55LFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHRoaXMuZGF0YS50ZXh0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwb3J0YWxUaXRsZSA9IGh0bWxDb21wb25lbnRzW1wiUG9ydGFsVGl0bGVcIl1cbiAgICAgICAgICAgIC8vIGNvbnN0IHBvcnRhbFN1YnRpdGxlID0gaHRtbENvbXBvbmVudHNbXCJQb3J0YWxTdWJ0aXRsZVwiXVxuXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlID0gYXdhaXQgcG9ydGFsVGl0bGUodGl0bGVTY3JpcHREYXRhKVxuICAgICAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZSA9IHBvcnRhbFN1YnRpdGxlKHN1YnRpdGxlU2NyaXB0RGF0YSlcblxuICAgICAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRCgncG9ydGFsVGl0bGUnLCB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QpXG4gICAgICAgICAgICBsZXQgc2l6ZSA9IHRoaXMucG9ydGFsVGl0bGUuZ2V0U2l6ZSgpXG4gICAgICAgICAgICBsZXQgdGl0bGVTY2FsZVggPSAoc2NhbGVXLngpIC8gdGhpcy5kYXRhLnRleHRTY2FsZVxuICAgICAgICAgICAgbGV0IHRpdGxlU2NhbGVZID0gKHNjYWxlVy55KSAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgICAgIGxldCB0aXRsZVNjYWxlWiA9IChzY2FsZVcueikgLyB0aGlzLmRhdGEudGV4dFNjYWxlXG5cbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5zY2FsZS54IC89IHRpdGxlU2NhbGVYXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0Quc2NhbGUueSAvPSB0aXRsZVNjYWxlWVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnogLz0gdGl0bGVTY2FsZVpcblxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnggPSBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kYXRhLnRleHRQb3NpdGlvbi54IC8gKHNjYWxlVy54KVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnkgPSBcbiAgICAgICAgICAgICAgICAgICAgKDAuNSAqIHNjYWxlTS55KSArXG4gICAgICAgICAgICAgICAgICAgICh0aGlzLmRhdGEuZHJhd0Rvb3IgPyAwLjEwNSA6IDApIC8gKHNjYWxlVy55KSArXG4gICAgICAgICAgICAgICAgICAgICgoc2l6ZS5oZWlnaHQgKiB0aGlzLmRhdGEudGV4dFNjYWxlKSAvMikgLyAoc2NhbGVXLnkpICsgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueSAvIChzY2FsZVcueSlcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi56ID0gXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueiAvIChzY2FsZVcueilcbiAgICAgICAgICAgIC8vIHRoaXMuZWwuc2V0T2JqZWN0M0QoJ3BvcnRhbFN1YnRpdGxlJywgdGhpcy5wb3J0YWxTdWJ0aXRsZS53ZWJMYXllcjNEKVxuICAgICAgICAgICAgLy8gdGhpcy5wb3J0YWxTdWJ0aXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnggPSAxXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIC8vIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7XG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEucmFkaXVzID0gdGhpcy5yYWRpdXNcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgPSB0aGlzLmNvbG9yXG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZU1hcFxuICAgICAgICAvLyB9KVxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3VwZGF0ZVBvcnRhbHMnLCB0aGlzLnVwZGF0ZVBvcnRhbClcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIHRoaXMudXBkYXRlUG9ydGFsKVxuXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFRpdGxlKSB7XG4gICAgICAgICAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwicG9ydGFsVGl0bGVcIilcblxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS5kZXN0cm95KClcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUgPSBudWxsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuY3ViZU1hcCkge1xuICAgICAgICAgICAgdGhpcy5jdWJlTWFwLmRpc3Bvc2UoKVxuICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gbnVsbFxuICAgICAgICB9IFxuICAgIH0sXG5cbiAgICAgICAgLy8gICByZXBsYWNlTWF0ZXJpYWw6IGZ1bmN0aW9uIChuZXdNYXRlcmlhbCkge1xuLy8gICAgIGxldCB0YXJnZXQgPSB0aGlzLmRhdGEubWF0ZXJpYWxUYXJnZXRcbi8vICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgIFxuLy8gICAgIGxldCB0cmF2ZXJzZSA9IChvYmplY3QpID0+IHtcbi8vICAgICAgIGxldCBtZXNoID0gb2JqZWN0XG4vLyAgICAgICBpZiAobWVzaC5tYXRlcmlhbCkge1xuLy8gICAgICAgICAgIG1hcE1hdGVyaWFscyhtZXNoLCAobWF0ZXJpYWwpID0+IHsgICAgICAgICBcbi8vICAgICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgbWF0ZXJpYWwubmFtZSA9PT0gdGFyZ2V0KSB7XG4vLyAgICAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsID0gbmV3TWF0ZXJpYWxcbi8vICAgICAgICAgICAgICAgfVxuLy8gICAgICAgICAgIH0pXG4vLyAgICAgICB9XG4vLyAgICAgICBjb25zdCBjaGlsZHJlbiA9IG9iamVjdC5jaGlsZHJlbjtcbi8vICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbi8vICAgICAgICAgICB0cmF2ZXJzZShjaGlsZHJlbltpXSk7XG4vLyAgICAgICB9XG4vLyAgICAgfVxuXG4vLyAgICAgbGV0IHJlcGxhY2VNYXRlcmlhbHMgPSAoKSA9PiB7XG4vLyAgICAgICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4vLyAgICAgICAgIHZhciBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4vLyAgICAgICAgIGlmICghbWVzaCkge1xuLy8gICAgICAgICAgICAgLy8gaWYgbm8gbWVzaCwgd2UnbGwgc2VhcmNoIHRocm91Z2ggYWxsIG9mIHRoZSBjaGlsZHJlbi4gIFRoaXMgd291bGRcbi8vICAgICAgICAgICAgIC8vIGhhcHBlbiBpZiB3ZSBkcm9wcGVkIHRoZSBjb21wb25lbnQgb24gYSBnbGIgaW4gc3Bva2Vcbi8vICAgICAgICAgICAgIG1lc2ggPSB0aGlzLmVsLm9iamVjdDNEXG4vLyAgICAgICAgIH1cbi8vICAgICAgICAgdHJhdmVyc2UobWVzaCk7XG4vLyAgICAgICAgLy8gdGhpcy5lbC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyKTtcbi8vICAgICB9XG5cbi8vICAgICAvLyBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbi8vICAgICAvLyBsZXQgaW5pdGlhbGl6ZXIgPSAoKSA9Pntcbi8vICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbi8vICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgcmVwbGFjZU1hdGVyaWFscylcbi8vICAgICAgIH0gZWxzZSB7XG4vLyAgICAgICAgICAgcmVwbGFjZU1hdGVyaWFscygpXG4vLyAgICAgICB9XG4vLyAgICAgLy8gfTtcbi8vICAgICAvL3JlcGxhY2VNYXRlcmlhbHMoKVxuLy8gICAgIC8vIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCBpbml0aWFsaXplcik7XG4vLyAgIH0sXG5cbi8vICAgZm9sbG93UG9ydGFsOiBmdW5jdGlvbigpIHtcbi8vICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEpIHtcbi8vICAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhyZWYgdG8gXCIgKyB0aGlzLm90aGVyKVxuLy8gICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHRoaXMub3RoZXJcbi8vICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbi8vICAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuLy8gICAgICAgfVxuLy8gICB9LFxuXG4gICAgc2V0dXBEb29yOiBmdW5jdGlvbigpIHtcbiAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UuICBUaGlzIGlzIHRoZSBvbmx5IHdheSB3ZSBhbGxvdyBidWlkbGluZyBhIFxuICAgICAgICAvLyBkb29yIGFyb3VuZCBpdFxuICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcbiAgICAgICAgbGV0IHJvdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKClcbiAgICAgICAgbGV0IHNjYWxlVyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgICAgICAgbGV0IHBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhXb3JsZC5kZWNvbXBvc2UocG9zLCByb3QsIHNjYWxlVylcblxuICAgICAgICB2YXIgd2lkdGggPSBzY2FsZVcueCAqIHNjYWxlTS54XG4gICAgICAgIHZhciBoZWlnaHQgPSBzY2FsZVcueSAqIHNjYWxlTS55XG4gICAgICAgIHZhciBkZXB0aCA9IHNjYWxlVy56ICogc2NhbGVNLnpcbiAgICAgICAgXG4gICAgICAgIC8vIGxldCBzY2FsZUkgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgIC8vIHZhciB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgLy8gdmFyIGhlaWdodCA9IHNjYWxlTS55ICogc2NhbGVJLnlcbiAgICAgICAgLy8gdmFyIGRlcHRoID0gMS4wOyAvLyAgc2NhbGVNLnogKiBzY2FsZUkuelxuICAgICAgICBjb25zdCBlbnZpcm9ubWVudE1hcENvbXBvbmVudCA9IHRoaXMuZWwuc2NlbmVFbC5jb21wb25lbnRzW1wiZW52aXJvbm1lbnQtbWFwXCJdO1xuXG4gICAgICAgIC8vIGxldCBhYm92ZSA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAvLyAgICAgbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDEsIDUwLCA1MCksXG4gICAgICAgIC8vICAgICBkb29ybWF0ZXJpYWxZIFxuICAgICAgICAvLyApO1xuICAgICAgICAvLyBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgLy8gICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAoYWJvdmUpO1xuICAgICAgICAvLyB9XG4gICAgICAgIC8vIGFib3ZlLnBvc2l0aW9uLnNldCgwLCAyLjUsIDApXG4gICAgICAgIC8vIHRoaXMuZWwub2JqZWN0M0QuYWRkKGFib3ZlKVxuXG4gICAgICAgIGxldCBsZWZ0ID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICAvLyBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xL3dpZHRoLDIvaGVpZ2h0LDAuMS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xL3dpZHRoLDEsMC4wOTkvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgW2Rvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vcm1hdGVyaWFsWSwgZG9vcm1hdGVyaWFsWSxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKGxlZnQpO1xuICAgICAgICB9XG4gICAgICAgIGxlZnQucG9zaXRpb24uc2V0KC0wLjUxLCAwLCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZChsZWZ0KVxuXG4gICAgICAgIGxldCByaWdodCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMS93aWR0aCwxLDAuMDk5L2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIFtkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JtYXRlcmlhbFksIGRvb3JtYXRlcmlhbFksZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbF0sIFxuICAgICAgICApO1xuXG4gICAgICAgIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChyaWdodCk7XG4gICAgICAgIH1cbiAgICAgICAgcmlnaHQucG9zaXRpb24uc2V0KDAuNTEsIDAsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHJpZ2h0KVxuXG4gICAgICAgIGxldCB0b3AgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxICsgMC4zL3dpZHRoLDAuMS9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIFtkb29ybWF0ZXJpYWxZLGRvb3JtYXRlcmlhbFksZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKHRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgdG9wLnBvc2l0aW9uLnNldCgwLjAsIDAuNTA1LCAwKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0b3ApXG5cbiAgICAgICAgLy8gaWYgKHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgIC8vICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAvLyAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgIC8vICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgLy8gfVxuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMudGltZS52YWx1ZSA9IHRpbWUgLyAxMDAwXG4gICAgICAgIGlmICghdGhpcy5tYXRlcmlhbHMpIHsgcmV0dXJuIH1cblxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUaXRsZSkge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS50aWNrKHRpbWUpXG4gICAgICAgICAgICAvLyB0aGlzLnBvcnRhbFN1YnRpdGxlLnRpY2sodGltZSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7XG4gICAgICAgICAgICBtYXQudXNlckRhdGEucmFkaXVzID0gdGhpcy5yYWRpdXNcbiAgICAgICAgICAgIG1hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlTWFwXG4gICAgICAgICAgICBXYXJwUG9ydGFsU2hhZGVyLnVwZGF0ZVVuaWZvcm1zKHRpbWUsIG1hdClcbiAgICAgICAgfSlcblxuICAgICAgICBpZiAodGhpcy5vdGhlciAmJiAhdGhpcy5zeXN0ZW0udGVsZXBvcnRpbmcpIHtcbiAgICAgICAgLy8gICB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUG9zaXRpb24od29ybGRQb3MpXG4gICAgICAgIC8vICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgICAvLyAgIHdvcmxkQ2FtZXJhUG9zLnkgLT0gdGhpcy5Zb2Zmc2V0XG4gICAgICAgIC8vICAgY29uc3QgZGlzdCA9IHdvcmxkQ2FtZXJhUG9zLmRpc3RhbmNlVG8od29ybGRQb3MpXG4gICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhUG9zKVxuICAgICAgICAgIHRoaXMuZWwub2JqZWN0M0Qud29ybGRUb0xvY2FsKHdvcmxkQ2FtZXJhUG9zKVxuXG4gICAgICAgICAgLy8gaW4gbG9jYWwgcG9ydGFsIGNvb3JkaW5hdGVzLCB0aGUgd2lkdGggYW5kIGhlaWdodCBhcmUgMVxuICAgICAgICAgIGlmIChNYXRoLmFicyh3b3JsZENhbWVyYVBvcy54KSA+IDAuNSB8fCBNYXRoLmFicyh3b3JsZENhbWVyYVBvcy55KSA+IDAuNSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBkaXN0ID0gTWF0aC5hYnMod29ybGRDYW1lcmFQb3Mueik7XG5cbiAgICAgICAgICAvLyB3aW5kb3cuQVBQLnV0aWxzLmNoYW5nZVRvSHViXG4gICAgICAgICAgaWYgKCh0aGlzLnBvcnRhbFR5cGUgPT0gMSB8fCB0aGlzLnBvcnRhbFR5cGUgPT0gNCkgJiYgZGlzdCA8IDAuMjUpIHtcbiAgICAgICAgICAgICAgaWYgKCF0aGlzLmxvY2F0aW9uaHJlZikge1xuICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlclxuICAgICAgICAgICAgICAgIGlmICghQVBQLnN0b3JlLnN0YXRlLnByZWZlcmVuY2VzLmZhc3RSb29tU3dpdGNoaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHdheVBvaW50ID0gdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbnZpcm9ubWVudFNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbnZpcm9ubWVudC1zY2VuZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGdvVG9XYXlQb2ludCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHdheVBvaW50ICYmIHdheVBvaW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkZBU1QgUk9PTSBTV0lUQ0ggSU5DTFVERVMgd2F5cG9pbnQ6IHNldHRpbmcgaGFzaCB0byBcIiArIHdheVBvaW50KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gd2F5UG9pbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkZBU1QgUk9PTSBTV0lUQ0guIGdvaW5nIHRvIFwiICsgdGhpcy5odWJfaWQpXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmh1YklkID09PSBBUFAuaHViLmh1Yl9pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJTYW1lIFJvb21cIilcbiAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9XYXlQb2ludCgpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuY2hhbmdlSHViKHRoaXMuaHViX2lkKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbnZpcm9ubWVudFNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICBjb25zb2xlLmxvZyhcIkVudmlyb25tZW50IHNjZW5lIGhhcyBsb2FkZWRcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdvVG9XYXlQb2ludCgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiAmJiBkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKVxuICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDMpIHtcbiAgICAgICAgICAgICAgaWYgKGRpc3QgPCAwLjI1KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmxvY2F0aW9uaHJlZikge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJzZXQgd2luZG93LmxvY2F0aW9uLmhhc2ggdG8gXCIgKyB0aGlzLm90aGVyKVxuICAgICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSB0aGlzLm90aGVyXG4gICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHRoaXMub3RoZXJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBzZXQgbG9jYXRpb25ocmVmLCB3ZSB0ZWxlcG9ydGVkLiAgd2hlbiBpdFxuICAgICAgICAgICAgICAgICAgLy8gZmluYWxseSBoYXBwZW5zLCBhbmQgd2UgbW92ZSBvdXRzaWRlIHRoZSByYW5nZSBvZiB0aGUgcG9ydGFsLFxuICAgICAgICAgICAgICAgICAgLy8gd2Ugd2lsbCBjbGVhciB0aGUgZmxhZ1xuICAgICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSBudWxsXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICBnZXRPdGhlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMCkgcmVzb2x2ZShudWxsKVxuICAgICAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSAgPT0gMSkge1xuICAgICAgICAgICAgICAgIC8vIGZpcnN0IHdhaXQgZm9yIHRoZSBodWJfaWRcbiAgICAgICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRSb29tSHViSWQodGhpcy5wb3J0YWxUYXJnZXQpLnRoZW4oaHViX2lkID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5odWJfaWQgPSBodWJfaWRcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgdGFyZ2V0IGlzIGFub3RoZXIgcm9vbSwgcmVzb2x2ZSB3aXRoIHRoZSBVUkwgdG8gdGhlIHJvb21cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Um9vbVVSTCh0aGlzLnBvcnRhbFRhcmdldCkudGhlbih1cmwgPT4geyBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0ICYmIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUodXJsICsgXCIjXCIgKyB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCkgXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMykge1xuICAgICAgICAgICAgICAgIHJlc29sdmUgKFwiI1wiICsgdGhpcy5wb3J0YWxUYXJnZXQpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDQpIHtcbiAgICAgICAgICAgICAgICBsZXQgdXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIFwiL1wiICsgdGhpcy5wb3J0YWxUYXJnZXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5odWJfaWQgPSB0aGlzLnBvcnRhbFRhcmdldFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0ICYmIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCArIFwiI1wiICsgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCkgXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBub3cgZmluZCB0aGUgcG9ydGFsIHdpdGhpbiB0aGUgcm9vbS4gIFRoZSBwb3J0YWxzIHNob3VsZCBjb21lIGluIHBhaXJzIHdpdGggdGhlIHNhbWUgcG9ydGFsVGFyZ2V0XG4gICAgICAgICAgICBjb25zdCBwb3J0YWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGBbcG9ydGFsXWApKVxuICAgICAgICAgICAgY29uc3Qgb3RoZXIgPSBwb3J0YWxzLmZpbmQoKGVsKSA9PiBlbC5jb21wb25lbnRzLnBvcnRhbC5wb3J0YWxUeXBlID09IHRoaXMucG9ydGFsVHlwZSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICBlbC5jb21wb25lbnRzLnBvcnRhbC5wb3J0YWxUYXJnZXQgPT09IHRoaXMucG9ydGFsVGFyZ2V0ICYmIFxuICAgICAgICAgICAgICAgICAgICAgICAgICBlbCAhPT0gdGhpcy5lbClcbiAgICAgICAgICAgIGlmIChvdGhlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gQ2FzZSAxOiBUaGUgb3RoZXIgcG9ydGFsIGFscmVhZHkgZXhpc3RzXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShvdGhlcik7XG4gICAgICAgICAgICAgICAgb3RoZXIuZW1pdCgncGFpcicsIHsgb3RoZXI6IHRoaXMuZWwgfSkgLy8gTGV0IHRoZSBvdGhlciBrbm93IHRoYXQgd2UncmUgcmVhZHlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQ2FzZSAyOiBXZSBjb3VsZG4ndCBmaW5kIHRoZSBvdGhlciBwb3J0YWwsIHdhaXQgZm9yIGl0IHRvIHNpZ25hbCB0aGF0IGl0J3MgcmVhZHlcbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3BhaXInLCAoZXZlbnQpID0+IHsgXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZXZlbnQuZGV0YWlsLm90aGVyKVxuICAgICAgICAgICAgICAgIH0sIHsgb25jZTogdHJ1ZSB9KVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0sXG5cbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IG5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIGVpdGhlciBcbiAgICAgICAgLy8gLSBcInJvb21fbmFtZV9jb2xvclwiXG4gICAgICAgIC8vIC0gXCJwb3J0YWxfTl9jb2xvclwiIFxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuIE51bWJlcmVkIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IG5vZGVOYW1lLm1hdGNoKC8oW0EtWmEtel0qKV8oW0EtWmEtejAtOV0qKV8oW0EtWmEtejAtOV0qKSQvKVxuICAgICAgICBcbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDQsIGZpcnN0IG1hdGNoIGlzIHRoZSBwb3J0YWwgdHlwZSxcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBuYW1lIG9yIG51bWJlciwgYW5kIGxhc3QgaXMgdGhlIGNvbG9yXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCA0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJwb3J0YWwgbm9kZSBuYW1lIG5vdCBmb3JtZWQgY29ycmVjdGx5OiBcIiwgbm9kZU5hbWUpXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgICAgIHRoaXMuY29sb3IgPSBcInJlZFwiIC8vIGRlZmF1bHQgc28gdGhlIHBvcnRhbCBoYXMgYSBjb2xvciB0byB1c2VcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBcbiAgICAgICAgdGhpcy5zZXRQb3J0YWxJbmZvKHBhcmFtc1sxXSwgcGFyYW1zWzJdLCBwYXJhbXNbM10pXG4gICAgfSxcblxuICAgIHNldFBvcnRhbEluZm86IGZ1bmN0aW9uKHBvcnRhbFR5cGUsIHBvcnRhbFRhcmdldCwgY29sb3IpIHtcbiAgICAgICAgaWYgKHBvcnRhbFR5cGUgPT09IFwicm9vbVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAxO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwYXJzZUludChwb3J0YWxUYXJnZXQpXG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJwb3J0YWxcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMjtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJ3YXlwb2ludFwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAzO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwb3J0YWxUYXJnZXRcbiAgICAgICAgfSBlbHNlIGlmIChwb3J0YWxUeXBlID09PSBcInJvb21OYW1lXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDQ7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2UgeyAgICBcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDA7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgfSBcbiAgICAgICAgdGhpcy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcihjb2xvcilcbiAgICB9LFxuXG4gICAgc2V0UmFkaXVzKHZhbCkge1xuICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZSgnYW5pbWF0aW9uX19wb3J0YWwnLCB7XG4gICAgICAgIC8vICAgZnJvbTogdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5yYWRpdXMudmFsdWUsXG4gICAgICAgICAgICBmcm9tOiB0aGlzLnJhZGl1cyxcbiAgICAgICAgICAgIHRvOiB2YWwsXG4gICAgICAgIH0pXG4gICAgfSxcbiAgICBvcGVuKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygxKVxuICAgIH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICAgIHRoaXMuc2V0UmFkaXVzKDAuMilcbiAgICB9LFxuICAgIGlzQ2xvc2VkKCkge1xuICAgICAgICAvLyByZXR1cm4gdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy5yYWRpdXMudmFsdWUgPT09IDBcbiAgICAgICAgcmV0dXJuIHRoaXMucmFkaXVzID09PSAwLjJcbiAgICB9LFxufSkiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vbGNhZ21hYy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzL2UxNzAyZWEyMWFmYjRhODYucG5nXCIiLCJjb25zdCBnbHNsID0gYFxudmFyeWluZyB2ZWMyIGJhbGx2VXY7XG52YXJ5aW5nIHZlYzMgYmFsbHZQb3NpdGlvbjtcbnZhcnlpbmcgdmVjMyBiYWxsdk5vcm1hbDtcbnZhcnlpbmcgdmVjMyBiYWxsdldvcmxkUG9zO1xudW5pZm9ybSBmbG9hdCBiYWxsVGltZTtcbnVuaWZvcm0gZmxvYXQgc2VsZWN0ZWQ7XG5cbm1hdDQgYmFsbGludmVyc2UobWF0NCBtKSB7XG4gIGZsb2F0XG4gICAgICBhMDAgPSBtWzBdWzBdLCBhMDEgPSBtWzBdWzFdLCBhMDIgPSBtWzBdWzJdLCBhMDMgPSBtWzBdWzNdLFxuICAgICAgYTEwID0gbVsxXVswXSwgYTExID0gbVsxXVsxXSwgYTEyID0gbVsxXVsyXSwgYTEzID0gbVsxXVszXSxcbiAgICAgIGEyMCA9IG1bMl1bMF0sIGEyMSA9IG1bMl1bMV0sIGEyMiA9IG1bMl1bMl0sIGEyMyA9IG1bMl1bM10sXG4gICAgICBhMzAgPSBtWzNdWzBdLCBhMzEgPSBtWzNdWzFdLCBhMzIgPSBtWzNdWzJdLCBhMzMgPSBtWzNdWzNdLFxuXG4gICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICBiMDEgPSBhMDAgKiBhMTIgLSBhMDIgKiBhMTAsXG4gICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICBiMDQgPSBhMDEgKiBhMTMgLSBhMDMgKiBhMTEsXG4gICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICBiMDcgPSBhMjAgKiBhMzIgLSBhMjIgKiBhMzAsXG4gICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICBiMTAgPSBhMjEgKiBhMzMgLSBhMjMgKiBhMzEsXG4gICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzIsXG5cbiAgICAgIGRldCA9IGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcblxuICByZXR1cm4gbWF0NChcbiAgICAgIGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSxcbiAgICAgIGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSxcbiAgICAgIGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMyxcbiAgICAgIGEyMiAqIGIwNCAtIGEyMSAqIGIwNSAtIGEyMyAqIGIwMyxcbiAgICAgIGExMiAqIGIwOCAtIGExMCAqIGIxMSAtIGExMyAqIGIwNyxcbiAgICAgIGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNyxcbiAgICAgIGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSxcbiAgICAgIGEyMCAqIGIwNSAtIGEyMiAqIGIwMiArIGEyMyAqIGIwMSxcbiAgICAgIGExMCAqIGIxMCAtIGExMSAqIGIwOCArIGExMyAqIGIwNixcbiAgICAgIGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNixcbiAgICAgIGEzMCAqIGIwNCAtIGEzMSAqIGIwMiArIGEzMyAqIGIwMCxcbiAgICAgIGEyMSAqIGIwMiAtIGEyMCAqIGIwNCAtIGEyMyAqIGIwMCxcbiAgICAgIGExMSAqIGIwNyAtIGExMCAqIGIwOSAtIGExMiAqIGIwNixcbiAgICAgIGEwMCAqIGIwOSAtIGEwMSAqIGIwNyArIGEwMiAqIGIwNixcbiAgICAgIGEzMSAqIGIwMSAtIGEzMCAqIGIwMyAtIGEzMiAqIGIwMCxcbiAgICAgIGEyMCAqIGIwMyAtIGEyMSAqIGIwMSArIGEyMiAqIGIwMCkgLyBkZXQ7XG59XG5cblxubWF0NCBiYWxsdHJhbnNwb3NlKGluIG1hdDQgbSkge1xuICB2ZWM0IGkwID0gbVswXTtcbiAgdmVjNCBpMSA9IG1bMV07XG4gIHZlYzQgaTIgPSBtWzJdO1xuICB2ZWM0IGkzID0gbVszXTtcblxuICByZXR1cm4gbWF0NChcbiAgICB2ZWM0KGkwLngsIGkxLngsIGkyLngsIGkzLngpLFxuICAgIHZlYzQoaTAueSwgaTEueSwgaTIueSwgaTMueSksXG4gICAgdmVjNChpMC56LCBpMS56LCBpMi56LCBpMy56KSxcbiAgICB2ZWM0KGkwLncsIGkxLncsIGkyLncsIGkzLncpXG4gICk7XG59XG5cbnZvaWQgbWFpbigpXG57XG4gIGJhbGx2VXYgPSB1djtcblxuICBiYWxsdlBvc2l0aW9uID0gcG9zaXRpb247XG5cbiAgdmVjMyBvZmZzZXQgPSB2ZWMzKFxuICAgIHNpbihwb3NpdGlvbi54ICogNTAuMCArIGJhbGxUaW1lKSxcbiAgICBzaW4ocG9zaXRpb24ueSAqIDEwLjAgKyBiYWxsVGltZSAqIDIuMCksXG4gICAgY29zKHBvc2l0aW9uLnogKiA0MC4wICsgYmFsbFRpbWUpXG4gICkgKiAwLjAwMztcblxuICAgYmFsbHZQb3NpdGlvbiAqPSAxLjAgKyBzZWxlY3RlZCAqIDAuMjtcblxuICAgYmFsbHZOb3JtYWwgPSBub3JtYWxpemUoYmFsbGludmVyc2UoYmFsbHRyYW5zcG9zZShtb2RlbE1hdHJpeCkpICogdmVjNChub3JtYWxpemUobm9ybWFsKSwgMS4wKSkueHl6O1xuICAgYmFsbHZXb3JsZFBvcyA9IChtb2RlbE1hdHJpeCAqIHZlYzQoYmFsbHZQb3NpdGlvbiwgMS4wKSkueHl6O1xuXG4gICB2ZWM0IGJhbGx2UG9zaXRpb24gPSBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KGJhbGx2UG9zaXRpb24gKyBvZmZzZXQsIDEuMCk7XG5cbiAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogYmFsbHZQb3NpdGlvbjtcbn1cbmBcblxuZXhwb3J0IGRlZmF1bHQgZ2xzbCIsImNvbnN0IGdsc2wgPSBgXG51bmlmb3JtIHNhbXBsZXIyRCBwYW5vdGV4O1xudW5pZm9ybSBzYW1wbGVyMkQgdGV4Zng7XG51bmlmb3JtIGZsb2F0IGJhbGxUaW1lO1xudW5pZm9ybSBmbG9hdCBzZWxlY3RlZDtcbnZhcnlpbmcgdmVjMiBiYWxsdlV2O1xudmFyeWluZyB2ZWMzIGJhbGx2UG9zaXRpb247XG52YXJ5aW5nIHZlYzMgYmFsbHZOb3JtYWw7XG52YXJ5aW5nIHZlYzMgYmFsbHZXb3JsZFBvcztcblxudW5pZm9ybSBmbG9hdCBvcGFjaXR5O1xuXG52b2lkIG1haW4oIHZvaWQgKSB7XG4gICB2ZWMyIHV2ID0gYmFsbHZVdjtcbiAgLy91di55ID0gIDEuMCAtIHV2Lnk7XG5cbiAgIHZlYzMgZXllID0gbm9ybWFsaXplKGNhbWVyYVBvc2l0aW9uIC0gYmFsbHZXb3JsZFBvcyk7XG4gICBmbG9hdCBmcmVzbmVsID0gYWJzKGRvdChleWUsIGJhbGx2Tm9ybWFsKSk7XG4gICBmbG9hdCBzaGlmdCA9IHBvdygoMS4wIC0gZnJlc25lbCksIDQuMCkgKiAwLjA1O1xuXG4gIHZlYzMgY29sID0gdmVjMyhcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYgLSBzaGlmdCkucixcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYpLmcsXG4gICAgdGV4dHVyZTJEKHBhbm90ZXgsIHV2ICsgc2hpZnQpLmJcbiAgKTtcblxuICAgY29sID0gbWl4KGNvbCAqIDAuNywgdmVjMygxLjApLCAwLjcgLSBmcmVzbmVsKTtcblxuICAgY29sICs9IHNlbGVjdGVkICogMC4zO1xuXG4gICBmbG9hdCB0ID0gYmFsbFRpbWUgKiAwLjQgKyBiYWxsdlBvc2l0aW9uLnggKyBiYWxsdlBvc2l0aW9uLno7XG4gICB1diA9IHZlYzIoYmFsbHZVdi54ICsgdCAqIDAuMiwgYmFsbHZVdi55ICsgdCk7XG4gICB2ZWMzIGZ4ID0gdGV4dHVyZTJEKHRleGZ4LCB1dikucmdiICogMC40O1xuXG4gIC8vdmVjNCBjb2wgPSB2ZWM0KDEuMCwgMS4wLCAwLjAsIDEuMCk7XG4gIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sICsgZngsIG9wYWNpdHkpO1xuICAvL2dsX0ZyYWdDb2xvciA9IHZlYzQoY29sICsgZngsIDEuMCk7XG59XG5gXG5cbmV4cG9ydCBkZWZhdWx0IGdsc2wiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogMzYwIGltYWdlIHRoYXQgZmlsbHMgdGhlIHVzZXIncyB2aXNpb24gd2hlbiBpbiBhIGNsb3NlIHByb3hpbWl0eS5cbiAqXG4gKiBVc2FnZVxuICogPT09PT09PVxuICogR2l2ZW4gYSAzNjAgaW1hZ2UgYXNzZXQgd2l0aCB0aGUgZm9sbG93aW5nIFVSTCBpbiBTcG9rZTpcbiAqIGh0dHBzOi8vZ3QtYWVsLWFxLWFzc2V0cy5hZWxhdGd0LWludGVybmFsLm5ldC9maWxlcy8xMjM0NWFiYy02Nzg5ZGVmLmpwZ1xuICpcbiAqIFRoZSBuYW1lIG9mIHRoZSBgaW1tZXJzaXZlLTM2MC5nbGJgIGluc3RhbmNlIGluIHRoZSBzY2VuZSBzaG91bGQgYmU6XG4gKiBcInNvbWUtZGVzY3JpcHRpdmUtbGFiZWxfXzEyMzQ1YWJjLTY3ODlkZWZfanBnXCIgT1IgXCIxMjM0NWFiYy02Nzg5ZGVmX2pwZ1wiXG4gKi9cblxuXG4vLyBUT0RPOiBcbi8vIC0gYWRqdXN0IHNpemUgb2YgcGFubyBiYWxsXG4vLyAtIGRyb3Agb24gdmlkZW8gb3IgaW1hZ2UgYW5kIHB1bGwgdmlkZW8vaW1hZ2UgZnJvbSB0aGF0IG1lZGlhIGxvY2F0aW9uXG4vLyAtIGludGVyY2VwdCBtb3VzZSBpbnB1dCBzb21laG93PyAgICBOb3Qgc3VyZSBpZiBpdCdzIHBvc3NpYmxlLlxuXG5cbmltcG9ydCBiYWxsZnggZnJvbSAnLi4vYXNzZXRzL2JhbGxmeC5wbmcnXG5pbXBvcnQgcGFub3ZlcnQgZnJvbSAnLi4vc2hhZGVycy9wYW5vYmFsbC52ZXJ0J1xuaW1wb3J0IHBhbm9mcmFnIGZyb20gJy4uL3NoYWRlcnMvcGFub2JhbGwuZnJhZydcblxuY29uc3Qgd29ybGRDYW1lcmEgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFNlbGYgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBiYWxsVGV4ID0gbnVsbFxubG9hZGVyLmxvYWQoYmFsbGZ4LCAoYmFsbCkgPT4ge1xuICAgIGJhbGwubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYWxsLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmFsbC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJhbGwud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYWxsVGV4ID0gYmFsbFxufSlcblxuLy8gc2ltcGxlIGhhY2sgdG8gZ2V0IHBvc2l0aW9uIG9mIHBhbm8gbWVkaWEgYWxpZ25lZCB3aXRoIGNhbWVyYS5cbi8vIFN5c3RlbXMgYXJlIHVwZGF0ZWQgYWZ0ZXIgY29tcG9uZW50cywgc28gd2UgZG8gdGhlIGZpbmFsIGFsaWdubWVudFxuLy8gd2l0aCB0aGUgY2FtZXJhIGFmdGVyIGFsbCB0aGUgY29tcG9uZW50cyBhcmUgdXBkYXRlZC5cbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgnaW1tZXJzaXZlLTM2MCcsIHtcbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudXBkYXRlVGhpcyA9IG51bGw7XG4gIH0sXG4gIHVwZGF0ZVBvc2l0aW9uKGNvbXBvbmVudCkge1xuICAgIC8vIFRPRE86ICBhZGQgdGhpcyB0byBhIHF1ZXVlLCBhbmQgcHJvY2VzcyB0aGUgcXVldWUgaW4gdGljaygpXG4gICAgdGhpcy51cGRhdGVUaGlzID0gY29tcG9uZW50O1xuICB9LFxuXG4gIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBUT0RPOiBwcm9jZXNzIHRoZSBxdWV1ZSwgcG9wcGluZyBldmVyeXRoaW5nIG9mZiB0aGUgcXVldWUgd2hlbiB3ZSBhcmUgZG9uZVxuICAgIGlmICh0aGlzLnVwZGF0ZVRoaXMpIHtcbiAgICAgIC8vL2xldCBjYW0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZpZXdpbmctY2FtZXJhXCIpLm9iamVjdDNETWFwLmNhbWVyYTtcbiAgICAgIHRoaXMudXBkYXRlVGhpcy5lbC5zY2VuZUVsLmNhbWVyYS51cGRhdGVNYXRyaWNlcygpO1xuICAgICAgdGhpcy51cGRhdGVUaGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgICB0aGlzLnVwZGF0ZVRoaXMuZWwub2JqZWN0M0Qud29ybGRUb0xvY2FsKHdvcmxkQ2FtZXJhKVxuICAgICAgdGhpcy51cGRhdGVUaGlzLm1lc2gucG9zaXRpb24uY29weSh3b3JsZENhbWVyYSlcbiAgICAgIHRoaXMudXBkYXRlVGhpcy5tZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgIHRoaXMudXBkYXRlVGhpcy5tZXNoLnVwZGF0ZVdvcmxkTWF0cml4KHRydWUsIGZhbHNlKVxuICAgIH1cbiAgfSxcblxufSlcbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgdXJsOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjE1IH0sXG4gIH0sXG5cbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zWydpbW1lcnNpdmUtMzYwJ11cblxuICAgIHZhciB1cmwgPSB0aGlzLmRhdGEudXJsXG4gICAgaWYgKCF1cmwgfHwgdXJsID09IFwiXCIpIHtcbiAgICAgICAgdXJsID0gdGhpcy5wYXJzZVNwb2tlTmFtZSgpXG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHVybC5tYXRjaCgvXi4qXFwuKC4qKSQvKVsxXVxuXG4gICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgIHRoaXMucGFubyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMucGFuby5zZXRBdHRyaWJ1dGUoJ21lZGlhLWltYWdlJywge1xuICAgICAgcHJvamVjdGlvbjogJzM2MC1lcXVpcmVjdGFuZ3VsYXInLFxuICAgICAgYWxwaGFNb2RlOiAnb3BhcXVlJyxcbiAgICAgIHNyYzogdXJsLFxuICAgICAgdmVyc2lvbjogMSxcbiAgICAgIGJhdGNoOiBmYWxzZSxcbiAgICAgIGNvbnRlbnRUeXBlOiBgaW1hZ2UvJHtleHRlbnNpb259YCxcbiAgICAgIGFscGhhQ3V0b2ZmOiAwLFxuICAgIH0pXG4gICAvLyB0aGlzLnBhbm8ub2JqZWN0M0QucG9zaXRpb24ueSA9IDEuNlxuICAgIHRoaXMuZWwuYXBwZW5kQ2hpbGQodGhpcy5wYW5vKVxuXG4gICAgLy8gYnV0IHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhpcyB0byBoYXBwZW5cbiAgICB0aGlzLm1lc2ggPSBhd2FpdCB0aGlzLmdldE1lc2goKVxuICAgIHRoaXMubWVzaC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgIHRoaXMubWVzaC51cGRhdGVXb3JsZE1hdHJpeCh0cnVlLCBmYWxzZSlcblxuICAgIHZhciBiYWxsID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSh0aGlzLmRhdGEucmFkaXVzLCAzMCwgMjApLFxuICAgICAgICBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgICAgcGFub3RleDoge3ZhbHVlOiB0aGlzLm1lc2gubWF0ZXJpYWwubWFwfSxcbiAgICAgICAgICAgICAgdGV4Zng6IHt2YWx1ZTogYmFsbFRleH0sXG4gICAgICAgICAgICAgIHNlbGVjdGVkOiB7dmFsdWU6IDB9LFxuICAgICAgICAgICAgICBiYWxsVGltZToge3ZhbHVlOiAwfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogcGFub3ZlcnQsXG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlcjogcGFub2ZyYWcsXG4gICAgICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgICB9KVxuICAgIClcbiAgIFxuICAgIC8vIGdldCB0aGUgcGFubyBvcmllbnRlZCBwcm9wZXJseSBpbiB0aGUgcm9vbSByZWxhdGl2ZSB0byB0aGUgd2F5IG1lZGlhLWltYWdlIGlzIG9yaWVudGVkXG4gICAgYmFsbC5yb3RhdGlvbi5zZXQoTWF0aC5QSSwgTWF0aC5QSSwgMCk7XG5cbiAgICBiYWxsLnVzZXJEYXRhLmZsb2F0WSA9ICh0aGlzLmRhdGEucmFkaXVzID4gMS41ID8gdGhpcy5kYXRhLnJhZGl1cyArIDAuMSA6IDEuNik7XG4gICAgYmFsbC51c2VyRGF0YS5zZWxlY3RlZCA9IDA7XG4gICAgYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgdGhpcy5iYWxsID0gYmFsbFxuICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJiYWxsXCIsIGJhbGwpXG5cbiAgICAvL3RoaXMubWVzaC5nZW9tZXRyeS5zY2FsZSgyLCAyLCAyKVxuICAgIHRoaXMubWVzaC5tYXRlcmlhbC5zZXRWYWx1ZXMoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBkZXB0aFRlc3Q6IGZhbHNlLFxuICAgIH0pXG4gICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuXG4gICAgdGhpcy5uZWFyID0gdGhpcy5kYXRhLnJhZGl1cyAtIDA7XG4gICAgdGhpcy5mYXIgPSB0aGlzLmRhdGEucmFkaXVzICsgMC4wNTtcblxuICAgIC8vIFJlbmRlciBPVkVSIHRoZSBzY2VuZSBidXQgVU5ERVIgdGhlIGN1cnNvclxuICAgIHRoaXMubWVzaC5yZW5kZXJPcmRlciA9IEFQUC5SRU5ERVJfT1JERVIuQ1VSU09SIC0gMC4xXG4gIH0sXG4gIHJlbW92ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5iYWxsLmdlb21ldHJ5LmRpc3Bvc2UoKVxuICAgIHRoaXMuYmFsbC5nZW9tZXRyeSA9IG51bGxcbiAgICB0aGlzLmJhbGwubWF0ZXJpYWwuZGlzcG9zZSgpXG4gICAgdGhpcy5iYWxsLm1hdGVyaWFsID0gbnVsbFxuICAgIHRoaXMuZWwucmVtb3ZlT2JqZWN0M0QoXCJiYWxsXCIpXG4gICAgdGhpcy5iYWxsID0gbnVsbFxuICB9LFxuICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgIGlmICh0aGlzLm1lc2ggJiYgYmFsbFRleCkge1xuICAgICAgbGV0IG9mZnNldCA9IE1hdGguY29zKCh0aW1lICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXQpLzEwMDAgKiAzICkgKiAwLjAyO1xuICAgICAgdGhpcy5iYWxsLnBvc2l0aW9uLnkgPSB0aGlzLmJhbGwudXNlckRhdGEuZmxvYXRZICsgb2Zmc2V0XG4gICAgICB0aGlzLmJhbGwubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuXG4gICAgICB0aGlzLmJhbGwubWF0ZXJpYWwudW5pZm9ybXMudGV4ZngudmFsdWUgPSBiYWxsVGV4XG4gICAgICB0aGlzLmJhbGwubWF0ZXJpYWwudW5pZm9ybXMuYmFsbFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyB0aGlzLmJhbGwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgLy8gTGluZWFybHkgbWFwIGNhbWVyYSBkaXN0YW5jZSB0byBtYXRlcmlhbCBvcGFjaXR5XG4gICAgICB0aGlzLmJhbGwuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFNlbGYpXG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IHdvcmxkU2VsZi5kaXN0YW5jZVRvKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3Qgb3BhY2l0eSA9IDEgLSAoZGlzdGFuY2UgLSB0aGlzLm5lYXIpIC8gKHRoaXMuZmFyIC0gdGhpcy5uZWFyKVxuICAgICAgaWYgKG9wYWNpdHkgPCAwKSB7XG4gICAgICAgICAgLy8gZmFyIGF3YXlcbiAgICAgICAgICB0aGlzLm1lc2gudmlzaWJsZSA9IGZhbHNlXG4gICAgICAgICAgdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSAxXG4gICAgICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLm9wYWNpdHkgPSAxXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eSA9IG9wYWNpdHkgPiAxID8gMSA6IG9wYWNpdHlcbiAgICAgICAgICAgIHRoaXMubWVzaC52aXNpYmxlID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLm9wYWNpdHkgPSB0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBwb3NpdGlvbiB0aGUgbWVzaCBhcm91bmQgdXNlciB1bnRpbCB0aGV5IGxlYXZlIHRoZSBiYWxsXG4gICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh3b3JsZENhbWVyYSlcbiAgICAgICAgICAgIC8vIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHdvcmxkQ2FtZXJhKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgICAgICAgLy8gd29ybGRTZWxmLnkgKz0gdGhpcy5iYWxsLnVzZXJEYXRhLmZsb2F0WTtcblxuICAgICAgICAgICAgLy8gd29ybGRTZWxmLnN1Yih3b3JsZENhbWVyYSlcbiAgICAgICAgICAgIC8vIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHdvcmxkU2VsZilcbiAgICAgICAgICAgIHRoaXMuc3lzdGVtLnVwZGF0ZVBvc2l0aW9uKHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuICB9LFxuICBwYXJzZVNwb2tlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgIC8vIEFjY2VwdGVkIG5hbWVzOiBcImxhYmVsX19pbWFnZS1oYXNoX2V4dFwiIE9SIFwiaW1hZ2UtaGFzaF9leHRcIlxuICAgIGNvbnN0IHNwb2tlTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgY29uc3QgbWF0Y2hlcyA9IHNwb2tlTmFtZS5tYXRjaCgvKD86LipfXyk/KC4qKV8oLiopLylcbiAgICBpZiAoIW1hdGNoZXMgfHwgbWF0Y2hlcy5sZW5ndGggPCAzKSB7IHJldHVybiBcIlwiIH1cbiAgICBjb25zdCBbLCBoYXNoLCBleHRlbnNpb25dICA9IG1hdGNoZXNcbiAgICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS8ke2hhc2h9LiR7ZXh0ZW5zaW9ufWBcbiAgICByZXR1cm4gdXJsXG4gIH0sXG4gIGdldE1lc2g6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IG1lc2ggPSB0aGlzLnBhbm8ub2JqZWN0M0RNYXAubWVzaFxuICAgICAgaWYgKG1lc2gpIHJlc29sdmUobWVzaClcbiAgICAgIHRoaXMucGFuby5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgICAnaW1hZ2UtbG9hZGVkJyxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJpbW1lcnNpdmUtMzYwIHBhbm8gbG9hZGVkOiBcIiArIHRoaXMuZGF0YS51cmwpXG4gICAgICAgICAgcmVzb2x2ZSh0aGlzLnBhbm8ub2JqZWN0M0RNYXAubWVzaClcbiAgICAgICAgfSxcbiAgICAgICAgeyBvbmNlOiB0cnVlIH1cbiAgICAgIClcbiAgICB9KVxuICB9LFxufSlcbiIsIi8vIFBhcmFsbGF4IE9jY2x1c2lvbiBzaGFkZXJzIGZyb21cbi8vICAgIGh0dHA6Ly9zdW5hbmRibGFja2NhdC5jb20vdGlwRnVsbFZpZXcucGhwP3RvcGljaWQ9Mjhcbi8vIE5vIHRhbmdlbnQtc3BhY2UgdHJhbnNmb3JtcyBsb2dpYyBiYXNlZCBvblxuLy8gICBodHRwOi8vbW1pa2tlbHNlbjNkLmJsb2dzcG90LnNrLzIwMTIvMDIvcGFyYWxsYXhwb2MtbWFwcGluZy1hbmQtbm8tdGFuZ2VudC5odG1sXG5cbi8vIElkZW50aXR5IGZ1bmN0aW9uIGZvciBnbHNsLWxpdGVyYWwgaGlnaGxpZ2h0aW5nIGluIFZTIENvZGVcbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmNvbnN0IFBhcmFsbGF4U2hhZGVyID0ge1xuICAvLyBPcmRlcmVkIGZyb20gZmFzdGVzdCB0byBiZXN0IHF1YWxpdHkuXG4gIG1vZGVzOiB7XG4gICAgbm9uZTogJ05PX1BBUkFMTEFYJyxcbiAgICBiYXNpYzogJ1VTRV9CQVNJQ19QQVJBTExBWCcsXG4gICAgc3RlZXA6ICdVU0VfU1RFRVBfUEFSQUxMQVgnLFxuICAgIG9jY2x1c2lvbjogJ1VTRV9PQ0xVU0lPTl9QQVJBTExBWCcsIC8vIGEuay5hLiBQT01cbiAgICByZWxpZWY6ICdVU0VfUkVMSUVGX1BBUkFMTEFYJyxcbiAgfSxcblxuICB1bmlmb3Jtczoge1xuICAgIGJ1bXBNYXA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBtYXA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiBudWxsIH0sXG4gICAgcGFyYWxsYXhNaW5MYXllcnM6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1heExheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICB9LFxuXG4gIHZlcnRleFNoYWRlcjogZ2xzbGBcbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdlV2ID0gdXY7XG4gICAgICB2ZWM0IG12UG9zaXRpb24gPSBtb2RlbFZpZXdNYXRyaXggKiB2ZWM0KCBwb3NpdGlvbiwgMS4wICk7XG4gICAgICB2Vmlld1Bvc2l0aW9uID0gLW12UG9zaXRpb24ueHl6O1xuICAgICAgdk5vcm1hbCA9IG5vcm1hbGl6ZSggbm9ybWFsTWF0cml4ICogbm9ybWFsICk7XG4gICAgICBcbiAgICAgIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbk1hdHJpeCAqIG12UG9zaXRpb247XG4gICAgfVxuICBgLFxuXG4gIGZyYWdtZW50U2hhZGVyOiBnbHNsYFxuICAgIHVuaWZvcm0gc2FtcGxlcjJEIGJ1bXBNYXA7XG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgbWFwO1xuXG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheFNjYWxlO1xuICAgIHVuaWZvcm0gZmxvYXQgcGFyYWxsYXhNaW5MYXllcnM7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1heExheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IGZhZGU7IC8vIENVU1RPTVxuXG4gICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICB2YXJ5aW5nIHZlYzMgdlZpZXdQb3NpdGlvbjtcbiAgICB2YXJ5aW5nIHZlYzMgdk5vcm1hbDtcblxuICAgICNpZmRlZiBVU0VfQkFTSUNfUEFSQUxMQVhcblxuICAgIHZlYzIgcGFyYWxsYXhNYXAoaW4gdmVjMyBWKSB7XG4gICAgICBmbG9hdCBpbml0aWFsSGVpZ2h0ID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHZVdikucjtcblxuICAgICAgLy8gTm8gT2Zmc2V0IExpbWl0dGluZzogbWVzc3ksIGZsb2F0aW5nIG91dHB1dCBhdCBncmF6aW5nIGFuZ2xlcy5cbiAgICAgIC8vXCJ2ZWMyIHRleENvb3JkT2Zmc2V0ID0gcGFyYWxsYXhTY2FsZSAqIFYueHkgLyBWLnogKiBpbml0aWFsSGVpZ2h0O1wiLFxuXG4gICAgICAvLyBPZmZzZXQgTGltaXRpbmdcbiAgICAgIHZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAqIGluaXRpYWxIZWlnaHQ7XG4gICAgICByZXR1cm4gdlV2IC0gdGV4Q29vcmRPZmZzZXQ7XG4gICAgfVxuXG4gICAgI2Vsc2VcblxuICAgIHZlYzIgcGFyYWxsYXhNYXAoaW4gdmVjMyBWKSB7XG4gICAgICAvLyBEZXRlcm1pbmUgbnVtYmVyIG9mIGxheWVycyBmcm9tIGFuZ2xlIGJldHdlZW4gViBhbmQgTlxuICAgICAgZmxvYXQgbnVtTGF5ZXJzID0gbWl4KHBhcmFsbGF4TWF4TGF5ZXJzLCBwYXJhbGxheE1pbkxheWVycywgYWJzKGRvdCh2ZWMzKDAuMCwgMC4wLCAxLjApLCBWKSkpO1xuXG4gICAgICBmbG9hdCBsYXllckhlaWdodCA9IDEuMCAvIG51bUxheWVycztcbiAgICAgIGZsb2F0IGN1cnJlbnRMYXllckhlaWdodCA9IDAuMDtcbiAgICAgIC8vIFNoaWZ0IG9mIHRleHR1cmUgY29vcmRpbmF0ZXMgZm9yIGVhY2ggaXRlcmF0aW9uXG4gICAgICB2ZWMyIGR0ZXggPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAvIG51bUxheWVycztcblxuICAgICAgdmVjMiBjdXJyZW50VGV4dHVyZUNvb3JkcyA9IHZVdjtcblxuICAgICAgZmxvYXQgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG5cbiAgICAgIC8vIHdoaWxlICggaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQgKVxuICAgICAgLy8gSW5maW5pdGUgbG9vcHMgYXJlIG5vdCB3ZWxsIHN1cHBvcnRlZC4gRG8gYSBcImxhcmdlXCIgZmluaXRlXG4gICAgICAvLyBsb29wLCBidXQgbm90IHRvbyBsYXJnZSwgYXMgaXQgc2xvd3MgZG93biBzb21lIGNvbXBpbGVycy5cbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMzA7IGkgKz0gMSkge1xuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPD0gY3VycmVudExheWVySGVpZ2h0KSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudExheWVySGVpZ2h0ICs9IGxheWVySGVpZ2h0O1xuICAgICAgICAvLyBTaGlmdCB0ZXh0dXJlIGNvb3JkaW5hdGVzIGFsb25nIHZlY3RvciBWXG4gICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzIC09IGR0ZXg7XG4gICAgICAgIGhlaWdodEZyb21UZXh0dXJlID0gdGV4dHVyZTJEKGJ1bXBNYXAsIGN1cnJlbnRUZXh0dXJlQ29vcmRzKS5yO1xuICAgICAgfVxuXG4gICAgICAjaWZkZWYgVVNFX1NURUVQX1BBUkFMTEFYXG5cbiAgICAgIHJldHVybiBjdXJyZW50VGV4dHVyZUNvb3JkcztcblxuICAgICAgI2VsaWYgZGVmaW5lZChVU0VfUkVMSUVGX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIGRlbHRhVGV4Q29vcmQgPSBkdGV4IC8gMi4wO1xuICAgICAgZmxvYXQgZGVsdGFIZWlnaHQgPSBsYXllckhlaWdodCAvIDIuMDtcblxuICAgICAgLy8gUmV0dXJuIHRvIHRoZSBtaWQgcG9pbnQgb2YgcHJldmlvdXMgbGF5ZXJcbiAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgLT0gZGVsdGFIZWlnaHQ7XG5cbiAgICAgIC8vIEJpbmFyeSBzZWFyY2ggdG8gaW5jcmVhc2UgcHJlY2lzaW9uIG9mIFN0ZWVwIFBhcmFsbGF4IE1hcHBpbmdcbiAgICAgIGNvbnN0IGludCBudW1TZWFyY2hlcyA9IDU7XG4gICAgICBmb3IgKGludCBpID0gMDsgaSA8IG51bVNlYXJjaGVzOyBpICs9IDEpIHtcbiAgICAgICAgZGVsdGFUZXhDb29yZCAvPSAyLjA7XG4gICAgICAgIGRlbHRhSGVpZ2h0IC89IDIuMDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICAgIC8vIFNoaWZ0IGFsb25nIG9yIGFnYWluc3QgdmVjdG9yIFZcbiAgICAgICAgaWYgKGhlaWdodEZyb21UZXh0dXJlID4gY3VycmVudExheWVySGVpZ2h0KSB7XG4gICAgICAgICAgLy8gQmVsb3cgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzIC09IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0ICs9IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGFib3ZlIHRoZSBzdXJmYWNlXG5cbiAgICAgICAgICBjdXJyZW50VGV4dHVyZUNvb3JkcyArPSBkZWx0YVRleENvb3JkO1xuICAgICAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9PQ0xVU0lPTl9QQVJBTExBWClcblxuICAgICAgdmVjMiBwcmV2VENvb3JkcyA9IGN1cnJlbnRUZXh0dXJlQ29vcmRzICsgZHRleDtcblxuICAgICAgLy8gSGVpZ2h0cyBmb3IgbGluZWFyIGludGVycG9sYXRpb25cbiAgICAgIGZsb2F0IG5leHRIID0gaGVpZ2h0RnJvbVRleHR1cmUgLSBjdXJyZW50TGF5ZXJIZWlnaHQ7XG4gICAgICBmbG9hdCBwcmV2SCA9IHRleHR1cmUyRChidW1wTWFwLCBwcmV2VENvb3JkcykuciAtIGN1cnJlbnRMYXllckhlaWdodCArIGxheWVySGVpZ2h0O1xuXG4gICAgICAvLyBQcm9wb3J0aW9ucyBmb3IgbGluZWFyIGludGVycG9sYXRpb25cbiAgICAgIGZsb2F0IHdlaWdodCA9IG5leHRIIC8gKG5leHRIIC0gcHJldkgpO1xuXG4gICAgICAvLyBJbnRlcnBvbGF0aW9uIG9mIHRleHR1cmUgY29vcmRpbmF0ZXNcbiAgICAgIHJldHVybiBwcmV2VENvb3JkcyAqIHdlaWdodCArIGN1cnJlbnRUZXh0dXJlQ29vcmRzICogKDEuMCAtIHdlaWdodCk7XG5cbiAgICAgICNlbHNlIC8vIE5PX1BBUkFMTEFYXG5cbiAgICAgIHJldHVybiB2VXY7XG5cbiAgICAgICNlbmRpZlxuICAgIH1cbiAgICAjZW5kaWZcblxuICAgIHZlYzIgcGVydHVyYlV2KHZlYzMgc3VyZlBvc2l0aW9uLCB2ZWMzIHN1cmZOb3JtYWwsIHZlYzMgdmlld1Bvc2l0aW9uKSB7XG4gICAgICB2ZWMyIHRleER4ID0gZEZkeCh2VXYpO1xuICAgICAgdmVjMiB0ZXhEeSA9IGRGZHkodlV2KTtcblxuICAgICAgdmVjMyB2U2lnbWFYID0gZEZkeChzdXJmUG9zaXRpb24pO1xuICAgICAgdmVjMyB2U2lnbWFZID0gZEZkeShzdXJmUG9zaXRpb24pO1xuICAgICAgdmVjMyB2UjEgPSBjcm9zcyh2U2lnbWFZLCBzdXJmTm9ybWFsKTtcbiAgICAgIHZlYzMgdlIyID0gY3Jvc3Moc3VyZk5vcm1hbCwgdlNpZ21hWCk7XG4gICAgICBmbG9hdCBmRGV0ID0gZG90KHZTaWdtYVgsIHZSMSk7XG5cbiAgICAgIHZlYzIgdlByb2pWc2NyID0gKDEuMCAvIGZEZXQpICogdmVjMihkb3QodlIxLCB2aWV3UG9zaXRpb24pLCBkb3QodlIyLCB2aWV3UG9zaXRpb24pKTtcbiAgICAgIHZlYzMgdlByb2pWdGV4O1xuICAgICAgdlByb2pWdGV4Lnh5ID0gdGV4RHggKiB2UHJvalZzY3IueCArIHRleER5ICogdlByb2pWc2NyLnk7XG4gICAgICB2UHJvalZ0ZXgueiA9IGRvdChzdXJmTm9ybWFsLCB2aWV3UG9zaXRpb24pO1xuXG4gICAgICByZXR1cm4gcGFyYWxsYXhNYXAodlByb2pWdGV4KTtcbiAgICB9XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2ZWMyIG1hcFV2ID0gcGVydHVyYlV2KC12Vmlld1Bvc2l0aW9uLCBub3JtYWxpemUodk5vcm1hbCksIG5vcm1hbGl6ZSh2Vmlld1Bvc2l0aW9uKSk7XG4gICAgICBcbiAgICAgIC8vIENVU1RPTSBTVEFSVFxuICAgICAgdmVjNCB0ZXhlbCA9IHRleHR1cmUyRChtYXAsIG1hcFV2KTtcbiAgICAgIHZlYzMgY29sb3IgPSBtaXgodGV4ZWwueHl6LCB2ZWMzKDApLCBmYWRlKTtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgICAvLyBDVVNUT00gRU5EXG4gICAgfVxuXG4gIGAsXG59XG5cbmV4cG9ydCB7IFBhcmFsbGF4U2hhZGVyIH1cbiIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBDcmVhdGUgdGhlIGlsbHVzaW9uIG9mIGRlcHRoIGluIGEgY29sb3IgaW1hZ2UgZnJvbSBhIGRlcHRoIG1hcFxuICpcbiAqIFVzYWdlXG4gKiA9PT09PVxuICogQ3JlYXRlIGEgcGxhbmUgaW4gQmxlbmRlciBhbmQgZ2l2ZSBpdCBhIG1hdGVyaWFsIChqdXN0IHRoZSBkZWZhdWx0IFByaW5jaXBsZWQgQlNERikuXG4gKiBBc3NpZ24gY29sb3IgaW1hZ2UgdG8gXCJjb2xvclwiIGNoYW5uZWwgYW5kIGRlcHRoIG1hcCB0byBcImVtaXNzaXZlXCIgY2hhbm5lbC5cbiAqIFlvdSBtYXkgd2FudCB0byBzZXQgZW1pc3NpdmUgc3RyZW5ndGggdG8gemVybyBzbyB0aGUgcHJldmlldyBsb29rcyBiZXR0ZXIuXG4gKiBBZGQgdGhlIFwicGFyYWxsYXhcIiBjb21wb25lbnQgZnJvbSB0aGUgSHVicyBleHRlbnNpb24sIGNvbmZpZ3VyZSwgYW5kIGV4cG9ydCBhcyAuZ2xiXG4gKi9cblxuaW1wb3J0IHsgUGFyYWxsYXhTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3BhcmFsbGF4LXNoYWRlci5qcydcblxuY29uc3QgdmVjID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgZm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncGFyYWxsYXgnLCB7XG4gIHNjaGVtYToge1xuICAgIHN0cmVuZ3RoOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjUgfSxcbiAgICBjdXRvZmZUcmFuc2l0aW9uOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiBNYXRoLlBJIC8gOCB9LFxuICAgIGN1dG9mZkFuZ2xlOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiBNYXRoLlBJIC8gNCB9LFxuICB9LFxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0RNYXAubWVzaFxuICAgIGNvbnN0IHsgbWFwOiBjb2xvck1hcCwgZW1pc3NpdmVNYXA6IGRlcHRoTWFwIH0gPSBtZXNoLm1hdGVyaWFsXG4gICAgY29sb3JNYXAud3JhcFMgPSBjb2xvck1hcC53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmdcbiAgICBkZXB0aE1hcC53cmFwUyA9IGRlcHRoTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGNvbnN0IHsgdmVydGV4U2hhZGVyLCBmcmFnbWVudFNoYWRlciB9ID0gUGFyYWxsYXhTaGFkZXJcbiAgICB0aGlzLm1hdGVyaWFsID0gbmV3IFRIUkVFLlNoYWRlck1hdGVyaWFsKHtcbiAgICAgIHZlcnRleFNoYWRlcixcbiAgICAgIGZyYWdtZW50U2hhZGVyLFxuICAgICAgZGVmaW5lczogeyBVU0VfT0NMVVNJT05fUEFSQUxMQVg6IHRydWUgfSxcbiAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgIG1hcDogeyB2YWx1ZTogY29sb3JNYXAgfSxcbiAgICAgICAgYnVtcE1hcDogeyB2YWx1ZTogZGVwdGhNYXAgfSxcbiAgICAgICAgcGFyYWxsYXhTY2FsZTogeyB2YWx1ZTogLTEgKiB0aGlzLmRhdGEuc3RyZW5ndGggfSxcbiAgICAgICAgcGFyYWxsYXhNaW5MYXllcnM6IHsgdmFsdWU6IDIwIH0sXG4gICAgICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiAzMCB9LFxuICAgICAgICBmYWRlOiB7IHZhbHVlOiAwIH0sXG4gICAgICB9LFxuICAgIH0pXG4gICAgbWVzaC5tYXRlcmlhbCA9IHRoaXMubWF0ZXJpYWxcbiAgfSxcbiAgdGljaygpIHtcbiAgICBpZiAodGhpcy5lbC5zY2VuZUVsLmNhbWVyYSkge1xuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHZlYylcbiAgICAgIHRoaXMuZWwub2JqZWN0M0Qud29ybGRUb0xvY2FsKHZlYylcbiAgICAgIGNvbnN0IGFuZ2xlID0gdmVjLmFuZ2xlVG8oZm9yd2FyZClcbiAgICAgIGNvbnN0IGZhZGUgPSBtYXBMaW5lYXJDbGFtcGVkKFxuICAgICAgICBhbmdsZSxcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlIC0gdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIHRoaXMuZGF0YS5jdXRvZmZBbmdsZSArIHRoaXMuZGF0YS5jdXRvZmZUcmFuc2l0aW9uLFxuICAgICAgICAwLCAvLyBJbiB2aWV3IHpvbmUsIG5vIGZhZGVcbiAgICAgICAgMSAvLyBPdXRzaWRlIHZpZXcgem9uZSwgZnVsbCBmYWRlXG4gICAgICApXG4gICAgICB0aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmZhZGUudmFsdWUgPSBmYWRlXG4gICAgfVxuICB9LFxufSlcblxuZnVuY3Rpb24gY2xhbXAodmFsdWUsIG1pbiwgbWF4KSB7XG4gIHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKG1heCwgdmFsdWUpKVxufVxuXG5mdW5jdGlvbiBtYXBMaW5lYXIoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGIxICsgKCh4IC0gYTEpICogKGIyIC0gYjEpKSAvIChhMiAtIGExKVxufVxuXG5mdW5jdGlvbiBtYXBMaW5lYXJDbGFtcGVkKHgsIGExLCBhMiwgYjEsIGIyKSB7XG4gIHJldHVybiBjbGFtcChtYXBMaW5lYXIoeCwgYTEsIGEyLCBiMSwgYjIpLCBiMSwgYjIpXG59XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vbGNhZ21hYy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzL2Y5OGI5NmZlM2UwNmVhMjAucG5nXCIiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogY3JlYXRlIGEgSFRNTCBvYmplY3QgYnkgcmVuZGVyaW5nIGEgc2NyaXB0IHRoYXQgY3JlYXRlcyBhbmQgbWFuYWdlcyBpdFxuICpcbiAqL1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuaW1wb3J0IHt2dWVDb21wb25lbnRzIGFzIGh0bWxDb21wb25lbnRzfSBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG5pbXBvcnQgc3Bpbm5lckltYWdlIGZyb20gXCIuLi9hc3NldHMvU3Bpbm5lci0xcy0yMDBweC5wbmdcIlxuXG4vLyBsb2FkIGFuZCBzZXR1cCBhbGwgdGhlIGJpdHMgb2YgdGhlIHRleHR1cmVzIGZvciB0aGUgZG9vclxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxuY29uc3Qgc3Bpbm5lckdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoIDEsIDEgKTtcbmNvbnN0IHNwaW5uZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgYWxwaGFUZXN0OiAwLjFcbn0pXG5cbmxvYWRlci5sb2FkKHNwaW5uZXJJbWFnZSwgKGNvbG9yKSA9PiB7XG4gICAgc3Bpbm5lck1hdGVyaWFsLm1hcCA9IGNvbG9yO1xuICAgIHNwaW5uZXJNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbi8vIHZhciBodG1sQ29tcG9uZW50cztcbi8vIHZhciBzY3JpcHRQcm9taXNlO1xuLy8gaWYgKHdpbmRvdy5fX3Rlc3RpbmdWdWVBcHBzKSB7XG4vLyAgICAgc2NyaXB0UHJvbWlzZSA9IGltcG9ydCh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykgICAgXG4vLyB9IGVsc2Uge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQoXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIikgXG4vLyB9XG4vLyAvLyBzY3JpcHRQcm9taXNlID0gc2NyaXB0UHJvbWlzZS50aGVuKG1vZHVsZSA9PiB7XG4vLyAvLyAgICAgcmV0dXJuIG1vZHVsZVxuLy8gLy8gfSk7XG4vKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuIEFGUkFNRS5yZWdpc3RlclN5c3RlbSgnaHRtbC1zY3JpcHQnLCB7ICBcbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLnN5c3RlbVRpY2sgPSBodG1sQ29tcG9uZW50c1tcInN5c3RlbVRpY2tcIl07XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsID0gaHRtbENvbXBvbmVudHNbXCJpbml0aWFsaXplRXRoZXJlYWxcIl1cbiAgICAgICAgaWYgKCF0aGlzLnN5c3RlbVRpY2sgfHwgIXRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJyb3IgaW4gaHRtbC1zY3JpcHQgc3lzdGVtOiBodG1sQ29tcG9uZW50cyBoYXMgbm8gc3lzdGVtVGljayBhbmQvb3IgaW5pdGlhbGl6ZUV0aGVyZWFsIG1ldGhvZHNcIilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsKClcbiAgICAgICAgfVxuICAgIH0sXG4gIFxuICAgIHRpY2sodCwgZHQpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrKHQsIGR0KVxuICAgIH0sXG4gIH0pXG4gIFxuY29uc3Qgb25jZSA9IHtcbiAgICBvbmNlIDogdHJ1ZVxufTtcbiAgXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0Jywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgbmFtZTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgd2lkdGg6IHsgdHlwZTogXCJudW1iZXJcIiwgZGVmYXVsdDogLTF9LFxuICAgICAgICBoZWlnaHQ6IHsgdHlwZTogXCJudW1iZXJcIiwgZGVmYXVsdDogLTF9LFxuICAgICAgICBwYXJhbWV0ZXIxOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXIyOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXIzOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXI0OiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGw7XG4gICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcblxuICAgICAgICB0aGlzLnNjcmlwdERhdGEgPSB7XG4gICAgICAgICAgICB3aWR0aDogdGhpcy5kYXRhLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmRhdGEuaGVpZ2h0LFxuICAgICAgICAgICAgcGFyYW1ldGVyMTogdGhpcy5kYXRhLnBhcmFtZXRlcjEsXG4gICAgICAgICAgICBwYXJhbWV0ZXIyOiB0aGlzLmRhdGEucGFyYW1ldGVyMixcbiAgICAgICAgICAgIHBhcmFtZXRlcjM6IHRoaXMuZGF0YS5wYXJhbWV0ZXIzLFxuICAgICAgICAgICAgcGFyYW1ldGVyNDogdGhpcy5kYXRhLnBhcmFtZXRlcjRcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubG9hZGluZyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lID0gbmV3IFRIUkVFLk1lc2goIHNwaW5uZXJHZW9tZXRyeSwgc3Bpbm5lck1hdGVyaWFsICk7XG4gICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lLnBvc2l0aW9uLnogPSAwLjA1XG4gICAgICAgIGlmICghdGhpcy5mdWxsTmFtZSB8fCB0aGlzLmZ1bGxOYW1lLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWVcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpXG4gICAgICAgIH0sIG9uY2UpO1xuXG4gICAgICAgIC8vdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICAvLyB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2NyaXB0KClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpO1xuICAgIH0sXG5cbiAgICBjcmVhdGVTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZWFjaCB0aW1lIHdlIGxvYWQgYSBzY3JpcHQgY29tcG9uZW50IHdlIHdpbGwgcG9zc2libHkgY3JlYXRlXG4gICAgICAgIC8vIGEgbmV3IG5ldHdvcmtlZCBjb21wb25lbnQuICBUaGlzIGlzIGZpbmUsIHNpbmNlIHRoZSBuZXR3b3JrZWQgSWQgXG4gICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBmdWxsIG5hbWUgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCBvciBhc3NpZ25lZCB0byB0aGVcbiAgICAgICAgLy8gY29tcG9uZW50IGluIFNwb2tlLiAgSXQgZG9lcyBtZWFuIHRoYXQgaWYgd2UgaGF2ZVxuICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAvLyBiZSBpbiBzeW5jLiAgSXQgYWxzbyBtZWFucyB0aGF0IGlmIHlvdSB3YW50IHRvIGRyb3AgYSBjb21wb25lbnQgb25cbiAgICAgICAgLy8gdGhlIHNjZW5lIHZpYSBhIC5nbGIsIGl0IG11c3QgaGF2ZSBhIHZhbGlkIG5hbWUgcGFyYW1ldGVyIGluc2lkZSBpdC5cbiAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgLy8gYSBuYW1lIGluc2lkZSBpdC5cbiAgICAgICAgbGV0IGxvYWRlciA9ICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMubG9hZFNjcmlwdCgpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gY3JlYXRpbmcgdGhpcyBhcyBwYXJ0IG9mIGEgR0xURiBsb2FkLCB0aGUgXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhcmVudCBhIGZldyBzdGVwcyB1cCB3aWxsIGJlIG5ldHdvcmtlZC4gIFdlJ2xsIG9ubHkgZG8gdGhpc1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgSFRNTCBzY3JpcHQgd2FudHMgdG8gYmUgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gbnVsbFxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpbmQgY2FsbGJhY2tzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRha2VPd25lcnNoaXAgPSB0aGlzLnRha2VPd25lcnNoaXAuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5zZXROZXR3b3JrTWV0aG9kcyh0aGlzLnRha2VPd25lcnNoaXAsIHRoaXMuc2V0U2hhcmVkRGF0YSlcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBzZXQgdXAgdGhlIGxvY2FsIGNvbnRlbnQgYW5kIGhvb2sgaXQgdG8gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgY29uc3Qgc2NyaXB0RWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBzY3JpcHRFbFxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0T2JqZWN0M0QoXCJ3ZWJsYXllcjNkXCIsIHRoaXMuc2NyaXB0LndlYkxheWVyM0QpXG5cbiAgICAgICAgICAgICAgICAvLyBsZXRzIGZpZ3VyZSBvdXQgdGhlIHNjYWxlLCBidXQgc2NhbGluZyB0byBmaWxsIHRoZSBhIDF4MW0gc3F1YXJlLCB0aGF0IGhhcyBhbHNvXG4gICAgICAgICAgICAgICAgLy8gcG90ZW50aWFsbHkgYmVlbiBzY2FsZWQgYnkgdGhlIHBhcmVudHMgcGFyZW50IG5vZGUuIElmIHdlIHNjYWxlIHRoZSBlbnRpdHkgaW4gc3Bva2UsXG4gICAgICAgICAgICAgICAgLy8gdGhpcyBpcyB3aGVyZSB0aGUgc2NhbGUgaXMgc2V0LiAgSWYgd2UgZHJvcCBhIG5vZGUgaW4gYW5kIHNjYWxlIGl0LCB0aGUgc2NhbGUgaXMgYWxzb1xuICAgICAgICAgICAgICAgIC8vIHNldCB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyBXZSB1c2VkIHRvIGhhdmUgYSBmaXhlZCBzaXplIHBhc3NlZCBiYWNrIGZyb20gdGhlIGVudGl0eSwgYnV0IHRoYXQncyB0b28gcmVzdHJpY3RpdmU6XG4gICAgICAgICAgICAgICAgLy8gY29uc3Qgd2lkdGggPSB0aGlzLnNjcmlwdC53aWR0aFxuICAgICAgICAgICAgICAgIC8vIGNvbnN0IGhlaWdodCA9IHRoaXMuc2NyaXB0LmhlaWdodFxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogbmVlZCB0byBmaW5kIGVudmlyb25tZW50LXNjZW5lLCBnbyBkb3duIHR3byBsZXZlbHMgdG8gdGhlIGdyb3VwIGFib3ZlIFxuICAgICAgICAgICAgICAgIC8vIHRoZSBub2RlcyBpbiB0aGUgc2NlbmUuICBUaGVuIGFjY3VtdWxhdGUgdGhlIHNjYWxlcyB1cCBmcm9tIHRoaXMgbm9kZSB0b1xuICAgICAgICAgICAgICAgIC8vIHRoYXQgbm9kZS4gIFRoaXMgd2lsbCBhY2NvdW50IGZvciBncm91cHMsIGFuZCBuZXN0aW5nLlxuXG4gICAgICAgICAgICAgICAgdmFyIHdpZHRoID0gMSwgaGVpZ2h0ID0gMTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UsIHNvIHRoZSBpbWFnZSBtZXNoIGlzIHNpemUgMSBhbmQgaXMgc2NhbGVkIGRpcmVjdGx5XG4gICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVJID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS56ID0gMVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBpdCdzIGVtYmVkZGVkIGluIGEgc2ltcGxlIGdsdGYgbW9kZWw7ICBvdGhlciBtb2RlbHMgbWF5IG5vdCB3b3JrXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGFzc3VtZSBpdCdzIGF0IHRoZSB0b3AgbGV2ZWwgbWVzaCwgYW5kIHRoYXQgdGhlIG1vZGVsIGl0c2VsZiBpcyBzY2FsZWRcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXVxuICAgICAgICAgICAgICAgICAgICBpZiAobWVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGJveCA9IG1lc2guZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IChib3gubWF4LnggLSBib3gubWluLngpICogbWVzaC5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSAoYm94Lm1heC55IC0gYm94Lm1pbi55KSAqIG1lc2guc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2hTY2FsZSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gbWVzaFNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IG1lc2hTY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSB0aGUgcm9vdCBnbHRmIHNjYWxlLlxuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyZW50MiA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwub2JqZWN0M0RcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggKj0gcGFyZW50Mi5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCAqPSBwYXJlbnQyLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5hY3R1YWxXaWR0aCA9IHdpZHRoXG4gICAgICAgICAgICAgICAgdGhpcy5hY3R1YWxIZWlnaHQgPSBoZWlnaHRcblxuICAgICAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgICAgICBpZiAod3NpemUgPiAwICYmIGhzaXplID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzcGlubmVyU2NhbGUgPSBNYXRoLm1pbih3aWR0aCxoZWlnaHQpICogMC4yNVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwaW5uZXJQbGFuZS5zY2FsZS5zZXQoc3Bpbm5lclNjYWxlLCBzcGlubmVyU2NhbGUsIDEpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgd2lsbCBiZSBvbmUgZWxlbWVudCBhbHJlYWR5LCB0aGUgY3ViZSB3ZSBjcmVhdGVkIGluIGJsZW5kZXJcbiAgICAgICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIHJlbW92ZSBpdCBpZiBpdCBpcyB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuLnBvcCgpXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIFwiaXNTdGF0aWNcIiBpcyBjb3JyZWN0OyAgY2FuJ3QgYmUgc3RhdGljIGlmIGVpdGhlciBpbnRlcmFjdGl2ZSBvciBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNTdGF0aWMgJiYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUgfHwgdGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hcHBlbmRDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcblxuICAgICAgICAgICAgICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJzcGlubmVyXCIsIHRoaXMuc3Bpbm5lclBsYW5lKVxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogIHdlIGFyZSBnb2luZyB0byBoYXZlIHRvIG1ha2Ugc3VyZSB0aGlzIHdvcmtzIGlmIFxuICAgICAgICAgICAgICAgIC8vIHRoZSBzY3JpcHQgaXMgT04gYW4gaW50ZXJhY3RhYmxlIChsaWtlIGFuIGltYWdlKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSB0aGUgaHRtbCBvYmplY3QgY2xpY2thYmxlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcblxuICAgICAgICAgICAgICAgICAgICAvLyBmb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgb2JqZWN0IFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsaWNrZWQgPSB0aGlzLmNsaWNrZWQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNEcmFnZ2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGFyZW4ndCBnb2luZyB0byByZWFsbHkgZGVhbCB3aXRoIHRoaXMgdGlsbCB3ZSBoYXZlIGEgdXNlIGNhc2UsIGJ1dFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgY2FuIHNldCBpdCB1cCBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0hvbGRhYmxlOiB0cnVlLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaG9sZGFibGVCdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLWRvd24nLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ1N0YXJ0KGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tdXAnLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ0VuZChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLnJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TCA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5UiA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vIGludGVyYWN0aXZpdHksIHBsZWFzZVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwiaXMtcmVtb3RlLWhvdmVyLXRhcmdldFwiKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRoaXMgU0hPVUxEIHdvcmsgYnV0IG1ha2Ugc3VyZSBpdCB3b3JrcyBpZiB0aGUgZWwgd2UgYXJlIG9uXG4gICAgICAgICAgICAgICAgLy8gaXMgbmV0d29ya2VkLCBzdWNoIGFzIHdoZW4gYXR0YWNoZWQgdG8gYW4gaW1hZ2VcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmhhc0F0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGZpbmRzIGFuIGV4aXN0aW5nIGNvcHkgb2YgdGhlIE5ldHdvcmtlZCBFbnRpdHkgKGlmIHdlIGFyZSBub3QgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGZpcnN0IGNsaWVudCBpbiB0aGUgcm9vbSBpdCB3aWxsIGV4aXN0IGluIG90aGVyIGNsaWVudHMgYW5kIGJlIGNyZWF0ZWQgYnkgTkFGKVxuICAgICAgICAgICAgICAgICAgICAvLyBvciBjcmVhdGUgYW4gZW50aXR5IGlmIHdlIGFyZSBmaXJzdC5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IGZ1bmN0aW9uIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ldElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBiZSBwYXJ0IG9mIGEgTmV0d29ya2VkIEdMVEYgaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgcGlubmVkIGFuZCBsb2FkZWQgd2hlbiB3ZSBlbnRlciB0aGUgcm9vbS4gIFVzZSB0aGUgbmV0d29ya2VkIHBhcmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgcGx1cyBhIGRpc2FtYmlndWF0aW5nIGJpdCBvZiB0ZXh0IHRvIGNyZWF0ZSBhIHVuaXF1ZSBJZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IE5BRi51dGlscy5nZXROZXR3b3JrSWQobmV0d29ya2VkRWwpICsgXCItaHRtbC1zY3JpcHRcIjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIG5lZWQgdG8gY3JlYXRlIGFuIGVudGl0eSwgdXNlIHRoZSBzYW1lIHBlcnNpc3RlbmNlIGFzIG91clxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmsgZW50aXR5ICh0cnVlIGlmIHBpbm5lZCwgZmFsc2UgaWYgbm90KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQgPSBlbnRpdHkuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5wZXJzaXN0ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIG9ubHkgaGFwcGVucyBpZiB0aGlzIGNvbXBvbmVudCBpcyBvbiBhIHNjZW5lIGZpbGUsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsZW1lbnRzIG9uIHRoZSBzY2VuZSBhcmVuJ3QgbmV0d29ya2VkLiAgU28gbGV0J3MgYXNzdW1lIGVhY2ggZW50aXR5IGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNjZW5lIHdpbGwgaGF2ZSBhIHVuaXF1ZSBuYW1lLiAgQWRkaW5nIGEgYml0IG9mIHRleHQgc28gd2UgY2FuIGZpbmQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgRE9NIHdoZW4gZGVidWdnaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gdGhpcy5mdWxsTmFtZS5yZXBsYWNlQWxsKFwiX1wiLFwiLVwiKSArIFwiLWh0bWwtc2NyaXB0XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIG5ldHdvcmtlZCBlbnRpdHkgd2UgY3JlYXRlIGZvciB0aGlzIGNvbXBvbmVudCBhbHJlYWR5IGV4aXN0cy4gXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UsIGNyZWF0ZSBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBOT1RFOiBpdCBpcyBjcmVhdGVkIG9uIHRoZSBzY2VuZSwgbm90IGFzIGEgY2hpbGQgb2YgdGhpcyBlbnRpdHksIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgTkFGIGNyZWF0ZXMgcmVtb3RlIGVudGl0aWVzIGluIHRoZSBzY2VuZS5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmVudGl0aWVzLmhhc0VudGl0eShuZXRJZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBOQUYuZW50aXRpZXMuZ2V0RW50aXR5KG5ldElkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1ldGhvZCB0byByZXRyaWV2ZSB0aGUgc2NyaXB0IGRhdGEgb24gdGhpcyBlbnRpdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBcIm5ldHdvcmtlZFwiIGNvbXBvbmVudCBzaG91bGQgaGF2ZSBwZXJzaXN0ZW50PXRydWUsIHRoZSB0ZW1wbGF0ZSBhbmQgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHNldCwgb3duZXIgc2V0IHRvIFwic2NlbmVcIiAoc28gdGhhdCBpdCBkb2Vzbid0IHVwZGF0ZSB0aGUgcmVzdCBvZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSB3b3JsZCB3aXRoIGl0J3MgaW5pdGlhbCBkYXRhLCBhbmQgc2hvdWxkIE5PVCBzZXQgY3JlYXRvciAodGhlIHN5c3RlbSB3aWxsIGRvIHRoYXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LnNldEF0dHJpYnV0ZSgnbmV0d29ya2VkJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudDogcGVyc2lzdGVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3duZXI6IFwic2NlbmVcIiwgIC8vIHNvIHRoYXQgb3VyIGluaXRpYWwgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtJZDogbmV0SWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYXBwZW5kQ2hpbGQoZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2F2ZSBhIHBvaW50ZXIgdG8gdGhlIG5ldHdvcmtlZCBlbnRpdHkgYW5kIHRoZW4gd2FpdCBmb3IgaXQgdG8gYmUgZnVsbHlcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIGJlZm9yZSBnZXR0aW5nIGEgcG9pbnRlciB0byB0aGUgYWN0dWFsIG5ldHdvcmtlZCBjb21wb25lbnQgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLm5ldEVudGl0eSkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wic2NyaXB0LWRhdGFcIl1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgdGhlIGZpcnN0IG5ldHdvcmtlZCBlbnRpdHksIGl0J3Mgc2hhcmVkRGF0YSB3aWxsIGRlZmF1bHQgdG8gdGhlICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcgXCJ7fVwiLCBhbmQgd2Ugc2hvdWxkIGluaXRpYWxpemUgaXQgd2l0aCB0aGUgaW5pdGlhbCBkYXRhIGZyb20gdGhlIHNjcmlwdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5zaGFyZWREYXRhLmxlbmd0aCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXR3b3JrZWQgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wibmV0d29ya2VkXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIChuZXR3b3JrZWQuZGF0YS5jcmVhdG9yID09IE5BRi5jbGllbnRJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgdGhpcy5zdGF0ZVN5bmMuaW5pdFNoYXJlZERhdGEodGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5lbCkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eShuZXR3b3JrZWRFbClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IHRoaXMuc2V0dXBOZXR3b3JrZWQuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWV0aG9kIGhhbmRsZXMgdGhlIGRpZmZlcmVudCBzdGFydHVwIGNhc2VzOlxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgICAgIC8vICAgaW1tZWRpYXRlbHkgaW5pdGlhbGl6ZVxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIGlzIGluIHRoZSByb29tIHNjZW5lIG9yIHBpbm5lZCwgaXQgd2lsbCBsaWtlbHkgYmUgY3JlYXRlZFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgICAgIC8vICAgZmlyZWQgd2hlbiBIdWJzIGhhcyBzdGFydGVkIE5BRlxuICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmNvbm5lY3Rpb24gJiYgTkFGLmNvbm5lY3Rpb24uaXNDb25uZWN0ZWQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2RpZENvbm5lY3RUb05ldHdvcmtlZFNjZW5lJywgdGhpcy5zZXR1cE5ldHdvcmtlZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJsb2FkU2NyaXB0IGZhaWxlZCBmb3Igc2NyaXB0IFwiICsgdGhpcy5kYXRhLm5hbWUgKyBcIjogXCIgKyBlKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiBhdHRhY2hlZCB0byBhIG5vZGUgd2l0aCBhIG1lZGlhLWxvYWRlciBjb21wb25lbnQsIHRoaXMgbWVhbnMgd2UgYXR0YWNoZWQgdGhpcyBjb21wb25lbnRcbiAgICAgICAgLy8gdG8gYSBtZWRpYSBvYmplY3QgaW4gU3Bva2UuICBXZSBzaG91bGQgd2FpdCB0aWxsIHRoZSBvYmplY3QgaXMgZnVsbHkgbG9hZGVkLiAgXG4gICAgICAgIC8vIE90aGVyd2lzZSwgaXQgd2FzIGF0dGFjaGVkIHRvIHNvbWV0aGluZyBpbnNpZGUgYSBHTFRGIChwcm9iYWJseSBpbiBibGVuZGVyKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBsYXk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wbGF5KClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwYXVzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnBhdXNlKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBoYW5kbGUgXCJpbnRlcmFjdFwiIGV2ZW50cyBmb3IgY2xpY2thYmxlIGVudGl0aWVzXG4gICAgY2xpY2tlZDogZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiY2xpY2tlZCBvbiBodG1sOiBcIiwgZXZ0KVxuICAgICAgICB0aGlzLnNjcmlwdC5jbGlja2VkKGV2dCkgXG4gICAgfSxcbiAgXG4gICAgLy8gbWV0aG9kcyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSBodG1sIG9iamVjdCBzbyB0aGV5IGNhbiB1cGRhdGUgbmV0d29ya2VkIGRhdGFcbiAgICB0YWtlT3duZXJzaGlwOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMudGFrZU93bmVyc2hpcCgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIHN1cmUsIGdvIGFoZWFkIGFuZCBjaGFuZ2UgaXQgZm9yIG5vd1xuICAgICAgICB9XG4gICAgfSxcbiAgICBcbiAgICBzZXRTaGFyZWREYXRhOiBmdW5jdGlvbihkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnNldFNoYXJlZERhdGEoZGF0YU9iamVjdClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyB0aGlzIGlzIGNhbGxlZCBmcm9tIGJlbG93LCB0byBnZXQgdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICBnZXRTaGFyZWREYXRhOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICAgICAgLy8gc2hvdWxkbid0IGhhcHBlblxuICAgICAgICBjb25zb2xlLndhcm4oXCJzY3JpcHQtZGF0YSBjb21wb25lbnQgY2FsbGVkIHBhcmVudCBlbGVtZW50IGJ1dCB0aGVyZSBpcyBubyBzY3JpcHQgeWV0P1wiKVxuICAgICAgICByZXR1cm4gXCJ7fVwiXG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLmxvYWRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lLnJvdGF0aW9uLnogKz0gMC4wM1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAvLyBtb3JlIG9yIGxlc3MgY29waWVkIGZyb20gXCJob3ZlcmFibGUtdmlzdWFscy5qc1wiIGluIGh1YnNcbiAgICAgICAgICAgICAgICBjb25zdCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuICAgICAgICAgICAgICAgIHZhciBwYXNzdGhydUludGVyYWN0b3IgPSBbXVxuXG4gICAgICAgICAgICAgICAgbGV0IGludGVyYWN0b3JPbmUsIGludGVyYWN0b3JUd287XG4gICAgICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uLnJlYWR5KSByZXR1cm47IC8vRE9NQ29udGVudFJlYWR5IHdvcmthcm91bmRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBsZXQgaG92ZXJFbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yT25lKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yT25lLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TC5zZXQocG9zLCBkaXIpXG5cbiAgICAgICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheUwpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yVHdvKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yVHdvLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5Ui5zZXQocG9zLCBkaXIpXG4gICAgICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlSKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QuaW50ZXJhY3Rpb25SYXlzID0gcGFzc3RocnVJbnRlcmFjdG9yXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhhdmVuJ3QgZmluaXNoZWQgc2V0dGluZyB1cCB0aGUgbmV0d29ya2VkIGVudGl0eSBkb24ndCBkbyBhbnl0aGluZy5cbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykgeyByZXR1cm4gfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIHN0YXRlIGhhcyBjaGFuZ2VkIGluIHRoZSBuZXR3b3JrZWQgZGF0YSwgdXBkYXRlIG91ciBodG1sIG9iamVjdFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC51cGRhdGVTaGFyZWREYXRhKHRoaXMuc3RhdGVTeW5jLmRhdGFPYmplY3QpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC50aWNrKHRpbWUpXG4gICAgICAgIH1cbiAgICB9LFxuICBcbiAgICAvLyBUT0RPOiAgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGlmIHRoZXJlIGlzIG5vIHBhcmFtZXRlciBzcGVjaWZ5aW5nIHRoZVxuICAgIC8vIGh0bWwgc2NyaXB0IG5hbWUuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5mdWxsTmFtZSA9PT0gXCJcIikge1xuXG4gICAgICAgICAgICAvLyBUT0RPOiAgc3dpdGNoIHRoaXMgdG8gZmluZCBlbnZpcm9ubWVudC1yb290IGFuZCBnbyBkb3duIHRvIFxuICAgICAgICAgICAgLy8gdGhlIG5vZGUgYXQgdGhlIHJvb20gb2Ygc2NlbmUgKG9uZSBhYm92ZSB0aGUgdmFyaW91cyBub2RlcykuICBcbiAgICAgICAgICAgIC8vIHRoZW4gZ28gdXAgZnJvbSBoZXJlIHRpbGwgd2UgZ2V0IHRvIGEgbm9kZSB0aGF0IGhhcyB0aGF0IG5vZGVcbiAgICAgICAgICAgIC8vIGFzIGl0J3MgcGFyZW50XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgfSBcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJjb21wb25lbnROYW1lXCJcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIGZldGNoIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgcmVzb3VyY2VcbiAgICAgICAgLy8gY29tcG9uZW50TmFtZVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmZ1bGxOYW1lLm1hdGNoKC9fKFtBLVphLXowLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMywgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJodG1sLXNjcmlwdCBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5mdWxsTmFtZSlcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IG51bGxcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHBhcmFtc1sxXVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxvYWRTY3JpcHQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaWYgKHNjcmlwdFByb21pc2UpIHtcbiAgICAgICAgLy8gICAgIHRyeSB7XG4gICAgICAgIC8vICAgICAgICAgaHRtbENvbXBvbmVudHMgPSBhd2FpdCBzY3JpcHRQcm9taXNlO1xuICAgICAgICAvLyAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgLy8gICAgICAgICByZXR1cm5cbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gICAgIHNjcmlwdFByb21pc2UgPSBudWxsXG4gICAgICAgIC8vIH1cbiAgICAgICAgdmFyIGluaXRTY3JpcHQgPSBodG1sQ29tcG9uZW50c1t0aGlzLmNvbXBvbmVudE5hbWVdXG4gICAgICAgIGlmICghaW5pdFNjcmlwdCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZG9lc24ndCBoYXZlIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBuZXcgaW5pdFNjcmlwdCh0aGlzLnNjcmlwdERhdGEpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJyb3IgY3JlYXRpbmcgc2NyaXB0IGZvciBcIiArIHRoaXMuY29tcG9uZW50TmFtZSwgZSk7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zY3JpcHQpe1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAvLyB0aGlzLnNjcmlwdC53ZWJMYXllcjNELnJlZnJlc2godHJ1ZSlcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudXBkYXRlKHRydWUpXG5cbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LndhaXRGb3JSZWFkeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHt3aWR0aDogd3NpemUsIGhlaWdodDogaHNpemV9ID0gdGhpcy5zY3JpcHQuZ2V0U2l6ZSgpXG4gICAgICAgICAgICAgICAgaWYgKHdzaXplID4gMCAmJiBoc2l6ZSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4odGhpcy5hY3R1YWxXaWR0aCAvIHdzaXplLCB0aGlzLmFjdHVhbEhlaWdodCAvIGhzaXplKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyB3aGVuIGEgc2NyaXB0IGZpbmlzaGVzIGdldHRpbmcgcmVhZHksIHRlbGwgdGhlIFxuICAgICAgICAgICAgICAgIC8vIHBvcnRhbHMgdG8gdXBkYXRlIHRoZW1zZWx2ZXNcbiAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuZW1pdCgndXBkYXRlUG9ydGFscycpOyBcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwic3Bpbm5lclwiKTtcbiAgICAgICAgICAgIH0pXG5cdFx0fSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGZhaWxlZCB0byBpbml0aWFsaXplIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmRlc3Ryb3lTY3JpcHQoKVxuICAgIH0sXG5cbiAgICBkZXN0cm95U2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5BUFAuc2NlbmUucmVtb3ZlRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuXG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnJlbW92ZU9iamVjdDNEKFwid2VibGF5ZXIzZFwiKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQgJiYgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5ldEVudGl0eSlcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcmlwdC5kZXN0cm95KClcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgfVxufSlcblxuLy9cbi8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4vLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuLy9cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzY3JpcHQtZGF0YScsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2NyaXB0ZGF0YToge3R5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwie31cIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgc2NyaXB0IGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2NyaXB0ZGF0YSk7XG4gICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5kYXRhLnNjcmlwdGRhdGEpKVxuXG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2NyaXB0ZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBzY3JpcHQtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBpdCBpcyBsaWtlbHkgdGhhdCBhcHBseVBlcnNpc3RlbnRTeW5jIG9ubHkgbmVlZHMgdG8gYmUgY2FsbGVkIGZvciBwZXJzaXN0ZW50XG4gICAgLy8gbmV0d29ya2VkIGVudGl0aWVzLCBzbyB3ZSBfcHJvYmFibHlfIGRvbid0IG5lZWQgdG8gZG8gdGhpcy4gIEJ1dCBpZiB0aGVyZSBpcyBub1xuICAgIC8vIHBlcnNpc3RlbnQgZGF0YSBzYXZlZCBmcm9tIHRoZSBuZXR3b3JrIGZvciB0aGlzIGVudGl0eSwgdGhpcyBjb21tYW5kIGRvZXMgbm90aGluZy5cbiAgICBwbGF5KCkge1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gbm90IHN1cmUgaWYgdGhpcyBpcyByZWFsbHkgbmVlZGVkLCBidXQgY2FuJ3QgaHVydFxuICAgICAgICAgICAgaWYgKEFQUC51dGlscykgeyAvLyB0ZW1wb3JhcnkgdGlsbCB3ZSBzaGlwIG5ldyBjbGllbnRcbiAgICAgICAgICAgICAgICBBUFAudXRpbHMuYXBwbHlQZXJzaXN0ZW50U3luYyh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEubmV0d29ya0lkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICB0YWtlT3duZXJzaGlwKCkge1xuICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcblxuICAgIC8vIGluaXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAvLyAgICAgdHJ5IHtcbiAgICAvLyAgICAgICAgIHZhciBodG1sU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgIC8vICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gaHRtbFN0cmluZ1xuICAgIC8vICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgIC8vICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAvLyAgICAgfSBjYXRjaCAoZSkge1xuICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgIC8vICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgLy8gICAgIH1cbiAgICAvLyB9LFxuXG4gICAgLy8gVGhlIGtleSBwYXJ0IGluIHRoZXNlIG1ldGhvZHMgKHdoaWNoIGFyZSBjYWxsZWQgZnJvbSB0aGUgY29tcG9uZW50IGFib3ZlKSBpcyB0b1xuICAgIC8vIGNoZWNrIGlmIHdlIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSB0aGUgbmV0d29ya2VkIG9iamVjdC4gIElmIHdlIG93biBpdCAoaXNNaW5lKCkgaXMgdHJ1ZSlcbiAgICAvLyB3ZSBjYW4gY2hhbmdlIGl0LiAgSWYgd2UgZG9uJ3Qgb3duIGluLCB3ZSBjYW4gdHJ5IHRvIGJlY29tZSB0aGUgb3duZXIgd2l0aFxuICAgIC8vIHRha2VPd25lcnNoaXAoKS4gSWYgdGhpcyBzdWNjZWVkcywgd2UgY2FuIHNldCB0aGUgZGF0YS4gIFxuICAgIC8vXG4gICAgLy8gTk9URTogdGFrZU93bmVyc2hpcCBBVFRFTVBUUyB0byBiZWNvbWUgdGhlIG93bmVyLCBieSBhc3N1bWluZyBpdCBjYW4gYmVjb21lIHRoZVxuICAgIC8vIG93bmVyIGFuZCBub3RpZnlpbmcgdGhlIG5ldHdvcmtlZCBjb3BpZXMuICBJZiB0d28gb3IgbW9yZSBlbnRpdGllcyB0cnkgdG8gYmVjb21lXG4gICAgLy8gb3duZXIsICBvbmx5IG9uZSAodGhlIGxhc3Qgb25lIHRvIHRyeSkgYmVjb21lcyB0aGUgb3duZXIuICBBbnkgc3RhdGUgdXBkYXRlcyBkb25lXG4gICAgLy8gYnkgdGhlIFwiZmFpbGVkIGF0dGVtcHRlZCBvd25lcnNcIiB3aWxsIG5vdCBiZSBkaXN0cmlidXRlZCB0byB0aGUgb3RoZXIgY2xpZW50cyxcbiAgICAvLyBhbmQgd2lsbCBiZSBvdmVyd3JpdHRlbiAoZXZlbnR1YWxseSkgYnkgdXBkYXRlcyBmcm9tIHRoZSBvdGhlciBjbGllbnRzLiAgIEJ5IG5vdFxuICAgIC8vIGF0dGVtcHRpbmcgdG8gZ3VhcmFudGVlIG93bmVyc2hpcCwgdGhpcyBjYWxsIGlzIGZhc3QgYW5kIHN5bmNocm9ub3VzLiAgQW55IFxuICAgIC8vIG1ldGhvZHMgZm9yIGd1YXJhbnRlZWluZyBvd25lcnNoaXAgY2hhbmdlIHdvdWxkIHRha2UgYSBub24tdHJpdmlhbCBhbW91bnQgb2YgdGltZVxuICAgIC8vIGJlY2F1c2Ugb2YgbmV0d29yayBsYXRlbmNpZXMuXG5cbiAgICBzZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKFwic2NyaXB0LWRhdGFcIiwgXCJzY3JpcHRkYXRhXCIsIGh0bWxTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuLy8gQWRkIG91ciB0ZW1wbGF0ZSBmb3Igb3VyIG5ldHdvcmtlZCBvYmplY3QgdG8gdGhlIGEtZnJhbWUgYXNzZXRzIG9iamVjdCxcbi8vIGFuZCBhIHNjaGVtYSB0byB0aGUgTkFGLnNjaGVtYXMuICBCb3RoIG11c3QgYmUgdGhlcmUgdG8gaGF2ZSBjdXN0b20gY29tcG9uZW50cyB3b3JrXG5cbmNvbnN0IGFzc2V0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLWFzc2V0c1wiKTtcblxuYXNzZXRzLmluc2VydEFkamFjZW50SFRNTChcbiAgICAnYmVmb3JlZW5kJyxcbiAgICBgXG4gICAgPHRlbXBsYXRlIGlkPVwic2NyaXB0LWRhdGEtbWVkaWFcIj5cbiAgICAgIDxhLWVudGl0eVxuICAgICAgICBzY3JpcHQtZGF0YVxuICAgICAgPjwvYS1lbnRpdHk+XG4gICAgPC90ZW1wbGF0ZT5cbiAgYFxuICApXG5cbmNvbnN0IHZlY3RvclJlcXVpcmVzVXBkYXRlID0gZXBzaWxvbiA9PiB7XG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGxldCBwcmV2ID0gbnVsbDtcblx0XHRcdHJldHVybiBjdXJyID0+IHtcblx0XHRcdFx0aWYgKHByZXYgPT09IG51bGwpIHtcblx0XHRcdFx0XHRwcmV2ID0gbmV3IFRIUkVFLlZlY3RvcjMoY3Vyci54LCBjdXJyLnksIGN1cnIueik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIU5BRi51dGlscy5hbG1vc3RFcXVhbFZlYzMocHJldiwgY3VyciwgZXBzaWxvbikpIHtcblx0XHRcdFx0XHRwcmV2LmNvcHkoY3Vycik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9O1xuXG5OQUYuc2NoZW1hcy5hZGQoe1xuICBcdHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgIGNvbXBvbmVudHM6IFtcbiAgICAvLyB7XG4gICAgLy8gICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgIC8vICAgICBwcm9wZXJ0eTogXCJyb3RhdGlvblwiLFxuICAgIC8vICAgICByZXF1aXJlc05ldHdvcmtVcGRhdGU6IHZlY3RvclJlcXVpcmVzVXBkYXRlKDAuMDAxKVxuICAgIC8vIH0sXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwic2NhbGVcIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIHtcbiAgICAgIFx0Y29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgICBcdHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgIH1dLFxuICAgICAgbm9uQXV0aG9yaXplZENvbXBvbmVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2NyaXB0ZGF0YVwiXG4gICAgICB9XG4gICAgXSxcblxuICB9KTtcblxuIiwiLyoqXG4gKiBjb250cm9sIGEgdmlkZW8gZnJvbSBhIGNvbXBvbmVudCB5b3Ugc3RhbmQgb24uICBJbXBsZW1lbnRzIGEgcmFkaXVzIGZyb20gdGhlIGNlbnRlciBvZiBcbiAqIHRoZSBvYmplY3QgaXQncyBhdHRhY2hlZCB0bywgaW4gbWV0ZXJzXG4gKi9cblxuaW1wb3J0IHsgRW50aXR5LCBDb21wb25lbnQgfSBmcm9tICdhZnJhbWUnXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcblxuaW50ZXJmYWNlIEFPYmplY3QzRCBleHRlbmRzIFRIUkVFLk9iamVjdDNEIHtcbiAgICBlbDogRW50aXR5XG59XG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgndmlkZW8tY29udHJvbC1wYWQnLCB7XG4gICAgbWVkaWFWaWRlbzoge30gYXMgQ29tcG9uZW50LFxuICAgIFxuICAgIHNjaGVtYToge1xuICAgICAgICB0YXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IFwiXCIgfSwgIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gICAgICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9XG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS50YXJnZXQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIG11c3QgaGF2ZSAndGFyZ2V0JyBzZXRcIilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gd2FpdCB1bnRpbCB0aGUgc2NlbmUgbG9hZHMgdG8gZmluaXNoLiAgV2Ugd2FudCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZ1xuICAgICAgICAvLyBpcyBpbml0aWFsaXplZFxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKCkgPT4geyBcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpXG4gICAgICAgIH0pO1xuICAgIH0sXG4gICAgXG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgdiA9IHRoaXMuZWwuc2NlbmVFbD8ub2JqZWN0M0QuZ2V0T2JqZWN0QnlOYW1lKHRoaXMuZGF0YS50YXJnZXQpIGFzIEFPYmplY3QzRFxuICAgICAgICBpZiAodiA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGRvZXMgbm90IGV4aXN0XCIpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICggdi5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdIHx8IHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdICkge1xuICAgICAgICAgICAgaWYgKHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cFZpZGVvUGFkKHYpXG4gICAgICAgICAgICAgICAgICAgIHYuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgZm4pXG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2LmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWRlb1BhZCh2KVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgaXMgbm90IGEgdmlkZW8gZWxlbWVudFwiKVxuICAgICAgICB9XG5cbiAgICB9LFxuXG4gICAgc2V0dXBWaWRlb1BhZDogZnVuY3Rpb24gKHZpZGVvOiBBT2JqZWN0M0QpIHtcbiAgICAgICAgdGhpcy5tZWRpYVZpZGVvID0gdmlkZW8uZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4gICAgICAgIGlmICh0aGlzLm1lZGlhVmlkZW8gPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBpcyBub3QgYSB2aWRlbyBlbGVtZW50XCIpXG4gICAgICAgIH1cblxuICAgICAgICAvLyAvL0B0cy1pZ25vcmVcbiAgICAgICAgLy8gaWYgKCF0aGlzLm1lZGlhVmlkZW8udmlkZW8ucGF1c2VkKSB7XG4gICAgICAgIC8vICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgLy8gICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdwcm94aW1pdHktZXZlbnRzJywgeyByYWRpdXM6IHRoaXMuZGF0YS5yYWRpdXMsIFlvZmZzZXQ6IDEuNiB9KVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWVudGVyJywgKCkgPT4gdGhpcy5lbnRlclJlZ2lvbigpKVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5sZWF2ZVJlZ2lvbigpKVxuICAgIH0sXG5cbiAgICBlbnRlclJlZ2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5tZWRpYVZpZGVvLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxlYXZlUmVnaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5tZWRpYVZpZGVvLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICB9XG4gICAgfSxcbn0pXG4iLCJjb25zdCB0ZW1wVmVjdG9yMyA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5jb25zdCB0ZW1wUXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0V29ybGRQb3NpdGlvbihzcmMsIHRhcmdldCkge1xuICBzcmMudXBkYXRlTWF0cmljZXMoKTtcbiAgdGFyZ2V0LnNldEZyb21NYXRyaXhQb3NpdGlvbihzcmMubWF0cml4V29ybGQpO1xuICByZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdFdvcmxkUXVhdGVybmlvbihzcmMsIHRhcmdldCkge1xuICBzcmMudXBkYXRlTWF0cmljZXMoKTtcbiAgc3JjLm1hdHJpeFdvcmxkLmRlY29tcG9zZSh0ZW1wVmVjdG9yMywgdGFyZ2V0LCB0ZW1wVmVjdG9yMyk7XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0V29ybGRTY2FsZShzcmMsIHRhcmdldCkge1xuICBzcmMudXBkYXRlTWF0cmljZXMoKTtcbiAgc3JjLm1hdHJpeFdvcmxkLmRlY29tcG9zZSh0ZW1wVmVjdG9yMywgdGVtcFF1YXRlcm5pb24sIHRhcmdldCk7XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlTWF0ZXJpYWwobXRybCkge1xuICBpZiAobXRybC5tYXApIG10cmwubWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwubGlnaHRNYXApIG10cmwubGlnaHRNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5idW1wTWFwKSBtdHJsLmJ1bXBNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5ub3JtYWxNYXApIG10cmwubm9ybWFsTWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwuc3BlY3VsYXJNYXApIG10cmwuc3BlY3VsYXJNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5lbnZNYXApIG10cmwuZW52TWFwLmRpc3Bvc2UoKTtcbiAgbXRybC5kaXNwb3NlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlTm9kZShub2RlKSB7XG4gIGlmICghKG5vZGUgaW5zdGFuY2VvZiBUSFJFRS5NZXNoKSkgcmV0dXJuO1xuXG4gIGlmIChub2RlLmdlb21ldHJ5KSB7XG4gICAgbm9kZS5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gIH1cblxuICBpZiAobm9kZS5tYXRlcmlhbCkge1xuICAgIGxldCBtYXRlcmlhbEFycmF5O1xuICAgIGlmIChub2RlLm1hdGVyaWFsIGluc3RhbmNlb2YgVEhSRUUuTWVzaEZhY2VNYXRlcmlhbCB8fCBub2RlLm1hdGVyaWFsIGluc3RhbmNlb2YgVEhSRUUuTXVsdGlNYXRlcmlhbCkge1xuICAgICAgbWF0ZXJpYWxBcnJheSA9IG5vZGUubWF0ZXJpYWwubWF0ZXJpYWxzO1xuICAgIH0gZWxzZSBpZiAobm9kZS5tYXRlcmlhbCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBtYXRlcmlhbEFycmF5ID0gbm9kZS5tYXRlcmlhbDtcbiAgICB9XG4gICAgaWYgKG1hdGVyaWFsQXJyYXkpIHtcbiAgICAgIG1hdGVyaWFsQXJyYXkuZm9yRWFjaChkaXNwb3NlTWF0ZXJpYWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkaXNwb3NlTWF0ZXJpYWwobm9kZS5tYXRlcmlhbCk7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IElERU5USVRZID0gbmV3IFRIUkVFLk1hdHJpeDQoKS5pZGVudGl0eSgpO1xuZXhwb3J0IGZ1bmN0aW9uIHNldE1hdHJpeFdvcmxkKG9iamVjdDNELCBtKSB7XG4gIGlmICghb2JqZWN0M0QubWF0cml4SXNNb2RpZmllZCkge1xuICAgIG9iamVjdDNELmFwcGx5TWF0cml4KElERU5USVRZKTsgLy8gaGFjayBhcm91bmQgb3VyIG1hdHJpeCBvcHRpbWl6YXRpb25zXG4gIH1cbiAgb2JqZWN0M0QubWF0cml4V29ybGQuY29weShtKTtcbiAgaWYgKG9iamVjdDNELnBhcmVudCkge1xuICAgIG9iamVjdDNELnBhcmVudC51cGRhdGVNYXRyaWNlcygpO1xuICAgIG9iamVjdDNELm1hdHJpeCA9IG9iamVjdDNELm1hdHJpeC5nZXRJbnZlcnNlKG9iamVjdDNELnBhcmVudC5tYXRyaXhXb3JsZCkubXVsdGlwbHkob2JqZWN0M0QubWF0cml4V29ybGQpO1xuICB9IGVsc2Uge1xuICAgIG9iamVjdDNELm1hdHJpeC5jb3B5KG9iamVjdDNELm1hdHJpeFdvcmxkKTtcbiAgfVxuICBvYmplY3QzRC5tYXRyaXguZGVjb21wb3NlKG9iamVjdDNELnBvc2l0aW9uLCBvYmplY3QzRC5xdWF0ZXJuaW9uLCBvYmplY3QzRC5zY2FsZSk7XG4gIG9iamVjdDNELmNoaWxkcmVuTmVlZE1hdHJpeFdvcmxkVXBkYXRlID0gdHJ1ZTtcbn1cblxuLy8gTW9kaWZpZWQgdmVyc2lvbiBvZiBEb24gTWNDdXJkeSdzIEFuaW1hdGlvblV0aWxzLmNsb25lXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbXJkb29iL3RocmVlLmpzL3B1bGwvMTQ0OTRcblxuZnVuY3Rpb24gcGFyYWxsZWxUcmF2ZXJzZShhLCBiLCBjYWxsYmFjaykge1xuICBjYWxsYmFjayhhLCBiKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGEuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICBwYXJhbGxlbFRyYXZlcnNlKGEuY2hpbGRyZW5baV0sIGIuY2hpbGRyZW5baV0sIGNhbGxiYWNrKTtcbiAgfVxufVxuXG4vLyBTdXBwb3J0cyB0aGUgZm9sbG93aW5nIFByb3BlcnR5QmluZGluZyBwYXRoIGZvcm1hdHM6XG4vLyB1dWlkLnByb3BlcnR5TmFtZVxuLy8gdXVpZC5wcm9wZXJ0eU5hbWVbcHJvcGVydHlJbmRleF1cbi8vIHV1aWQub2JqZWN0TmFtZVtvYmplY3RJbmRleF0ucHJvcGVydHlOYW1lW3Byb3BlcnR5SW5kZXhdXG4vLyBEb2VzIG5vdCBzdXBwb3J0IHByb3BlcnR5IGJpbmRpbmdzIHRoYXQgdXNlIG9iamVjdDNEIG5hbWVzIG9yIHBhcmVudCBub2Rlc1xuZnVuY3Rpb24gY2xvbmVLZXlmcmFtZVRyYWNrKHNvdXJjZUtleWZyYW1lVHJhY2ssIGNsb25lVVVJRExvb2t1cCkge1xuICBjb25zdCB7IG5vZGVOYW1lOiB1dWlkLCBvYmplY3ROYW1lLCBvYmplY3RJbmRleCwgcHJvcGVydHlOYW1lLCBwcm9wZXJ0eUluZGV4IH0gPSBUSFJFRS5Qcm9wZXJ0eUJpbmRpbmcucGFyc2VUcmFja05hbWUoXG4gICAgc291cmNlS2V5ZnJhbWVUcmFjay5uYW1lXG4gICk7XG5cbiAgbGV0IHBhdGggPSBcIlwiO1xuXG4gIGlmICh1dWlkICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBjbG9uZWRVVUlEID0gY2xvbmVVVUlETG9va3VwLmdldCh1dWlkKTtcblxuICAgIGlmIChjbG9uZWRVVUlEID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnNvbGUud2FybihgQ291bGQgbm90IGZpbmQgS2V5ZnJhbWVUcmFjayB0YXJnZXQgd2l0aCB1dWlkOiBcIiR7dXVpZH1cImApO1xuICAgIH1cblxuICAgIHBhdGggKz0gY2xvbmVkVVVJRDtcbiAgfVxuXG4gIGlmIChvYmplY3ROYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBwYXRoICs9IFwiLlwiICsgb2JqZWN0TmFtZTtcbiAgfVxuXG4gIGlmIChvYmplY3RJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcGF0aCArPSBcIltcIiArIG9iamVjdEluZGV4ICsgXCJdXCI7XG4gIH1cblxuICBpZiAocHJvcGVydHlOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBwYXRoICs9IFwiLlwiICsgcHJvcGVydHlOYW1lO1xuICB9XG5cbiAgaWYgKHByb3BlcnR5SW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggKz0gXCJbXCIgKyBwcm9wZXJ0eUluZGV4ICsgXCJdXCI7XG4gIH1cblxuICBjb25zdCBjbG9uZWRLZXlmcmFtZVRyYWNrID0gc291cmNlS2V5ZnJhbWVUcmFjay5jbG9uZSgpO1xuICBjbG9uZWRLZXlmcmFtZVRyYWNrLm5hbWUgPSBwYXRoO1xuXG4gIHJldHVybiBjbG9uZWRLZXlmcmFtZVRyYWNrO1xufVxuXG5mdW5jdGlvbiBjbG9uZUFuaW1hdGlvbkNsaXAoc291cmNlQW5pbWF0aW9uQ2xpcCwgY2xvbmVVVUlETG9va3VwKSB7XG4gIGNvbnN0IGNsb25lZFRyYWNrcyA9IHNvdXJjZUFuaW1hdGlvbkNsaXAudHJhY2tzLm1hcChrZXlmcmFtZVRyYWNrID0+XG4gICAgY2xvbmVLZXlmcmFtZVRyYWNrKGtleWZyYW1lVHJhY2ssIGNsb25lVVVJRExvb2t1cClcbiAgKTtcbiAgcmV0dXJuIG5ldyBUSFJFRS5BbmltYXRpb25DbGlwKHNvdXJjZUFuaW1hdGlvbkNsaXAubmFtZSwgc291cmNlQW5pbWF0aW9uQ2xpcC5kdXJhdGlvbiwgY2xvbmVkVHJhY2tzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lT2JqZWN0M0Qoc291cmNlLCBwcmVzZXJ2ZVVVSURzKSB7XG4gIGNvbnN0IGNsb25lTG9va3VwID0gbmV3IE1hcCgpO1xuICBjb25zdCBjbG9uZVVVSURMb29rdXAgPSBuZXcgTWFwKCk7XG5cbiAgY29uc3QgY2xvbmUgPSBzb3VyY2UuY2xvbmUoKTtcblxuICBwYXJhbGxlbFRyYXZlcnNlKHNvdXJjZSwgY2xvbmUsIChzb3VyY2VOb2RlLCBjbG9uZWROb2RlKSA9PiB7XG4gICAgY2xvbmVMb29rdXAuc2V0KHNvdXJjZU5vZGUsIGNsb25lZE5vZGUpO1xuICB9KTtcblxuICBzb3VyY2UudHJhdmVyc2Uoc291cmNlTm9kZSA9PiB7XG4gICAgY29uc3QgY2xvbmVkTm9kZSA9IGNsb25lTG9va3VwLmdldChzb3VyY2VOb2RlKTtcblxuICAgIGlmIChwcmVzZXJ2ZVVVSURzKSB7XG4gICAgICBjbG9uZWROb2RlLnV1aWQgPSBzb3VyY2VOb2RlLnV1aWQ7XG4gICAgfVxuXG4gICAgY2xvbmVVVUlETG9va3VwLnNldChzb3VyY2VOb2RlLnV1aWQsIGNsb25lZE5vZGUudXVpZCk7XG4gIH0pO1xuXG4gIHNvdXJjZS50cmF2ZXJzZShzb3VyY2VOb2RlID0+IHtcbiAgICBjb25zdCBjbG9uZWROb2RlID0gY2xvbmVMb29rdXAuZ2V0KHNvdXJjZU5vZGUpO1xuXG4gICAgaWYgKCFjbG9uZWROb2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNvdXJjZU5vZGUuYW5pbWF0aW9ucykge1xuICAgICAgY2xvbmVkTm9kZS5hbmltYXRpb25zID0gc291cmNlTm9kZS5hbmltYXRpb25zLm1hcChhbmltYXRpb25DbGlwID0+XG4gICAgICAgIGNsb25lQW5pbWF0aW9uQ2xpcChhbmltYXRpb25DbGlwLCBjbG9uZVVVSURMb29rdXApXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmIChzb3VyY2VOb2RlLmlzTWVzaCAmJiBzb3VyY2VOb2RlLmdlb21ldHJ5LmJvdW5kc1RyZWUpIHtcbiAgICAgIGNsb25lZE5vZGUuZ2VvbWV0cnkuYm91bmRzVHJlZSA9IHNvdXJjZU5vZGUuZ2VvbWV0cnkuYm91bmRzVHJlZTtcbiAgICB9XG5cbiAgICBpZiAoKGNsb25lZE5vZGUuaXNEaXJlY3Rpb25hbExpZ2h0IHx8IGNsb25lZE5vZGUuaXNTcG90TGlnaHQpICYmIHNvdXJjZU5vZGUudGFyZ2V0KSB7XG4gICAgICBjbG9uZWROb2RlLnRhcmdldCA9IGNsb25lTG9va3VwLmdldChzb3VyY2VOb2RlLnRhcmdldCk7XG4gICAgfVxuXG4gICAgaWYgKCFzb3VyY2VOb2RlLmlzU2tpbm5lZE1lc2gpIHJldHVybjtcblxuICAgIGNvbnN0IHNvdXJjZUJvbmVzID0gc291cmNlTm9kZS5za2VsZXRvbi5ib25lcztcblxuICAgIGNsb25lZE5vZGUuc2tlbGV0b24gPSBzb3VyY2VOb2RlLnNrZWxldG9uLmNsb25lKCk7XG5cbiAgICBjbG9uZWROb2RlLnNrZWxldG9uLmJvbmVzID0gc291cmNlQm9uZXMubWFwKHNvdXJjZUJvbmUgPT4ge1xuICAgICAgaWYgKCFjbG9uZUxvb2t1cC5oYXMoc291cmNlQm9uZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmVxdWlyZWQgYm9uZXMgYXJlIG5vdCBkZXNjZW5kYW50cyBvZiB0aGUgZ2l2ZW4gb2JqZWN0LlwiKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNsb25lTG9va3VwLmdldChzb3VyY2VCb25lKTtcbiAgICB9KTtcblxuICAgIGNsb25lZE5vZGUuYmluZChjbG9uZWROb2RlLnNrZWxldG9uLCBzb3VyY2VOb2RlLmJpbmRNYXRyaXgpO1xuICB9KTtcblxuICByZXR1cm4gY2xvbmU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTm9kZShyb290LCBwcmVkKSB7XG4gIGxldCBub2RlcyA9IFtyb290XTtcbiAgd2hpbGUgKG5vZGVzLmxlbmd0aCkge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlcy5zaGlmdCgpO1xuICAgIGlmIChwcmVkKG5vZGUpKSByZXR1cm4gbm9kZTtcbiAgICBpZiAobm9kZS5jaGlsZHJlbikgbm9kZXMgPSBub2Rlcy5jb25jYXQobm9kZS5jaGlsZHJlbik7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBpbnRlcnBvbGF0ZUFmZmluZSA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgbWF0NCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGVuZCA9IHtcbiAgICBwb3NpdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoKSxcbiAgICBxdWF0ZXJuaW9uOiBuZXcgVEhSRUUuUXVhdGVybmlvbigpLFxuICAgIHNjYWxlOiBuZXcgVEhSRUUuVmVjdG9yMygpXG4gIH07XG4gIGNvbnN0IHN0YXJ0ID0ge1xuICAgIHBvc2l0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygpLFxuICAgIHF1YXRlcm5pb246IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCksXG4gICAgc2NhbGU6IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgfTtcbiAgY29uc3QgaW50ZXJwb2xhdGVkID0ge1xuICAgIHBvc2l0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygpLFxuICAgIHF1YXRlcm5pb246IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCksXG4gICAgc2NhbGU6IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgfTtcbiAgcmV0dXJuIGZ1bmN0aW9uKHN0YXJ0TWF0NCwgZW5kTWF0NCwgcHJvZ3Jlc3MsIG91dE1hdDQpIHtcbiAgICBzdGFydC5xdWF0ZXJuaW9uLnNldEZyb21Sb3RhdGlvbk1hdHJpeChtYXQ0LmV4dHJhY3RSb3RhdGlvbihzdGFydE1hdDQpKTtcbiAgICBlbmQucXVhdGVybmlvbi5zZXRGcm9tUm90YXRpb25NYXRyaXgobWF0NC5leHRyYWN0Um90YXRpb24oZW5kTWF0NCkpO1xuICAgIFRIUkVFLlF1YXRlcm5pb24uc2xlcnAoc3RhcnQucXVhdGVybmlvbiwgZW5kLnF1YXRlcm5pb24sIGludGVycG9sYXRlZC5xdWF0ZXJuaW9uLCBwcm9ncmVzcyk7XG4gICAgaW50ZXJwb2xhdGVkLnBvc2l0aW9uLmxlcnBWZWN0b3JzKFxuICAgICAgc3RhcnQucG9zaXRpb24uc2V0RnJvbU1hdHJpeENvbHVtbihzdGFydE1hdDQsIDMpLFxuICAgICAgZW5kLnBvc2l0aW9uLnNldEZyb21NYXRyaXhDb2x1bW4oZW5kTWF0NCwgMyksXG4gICAgICBwcm9ncmVzc1xuICAgICk7XG4gICAgaW50ZXJwb2xhdGVkLnNjYWxlLmxlcnBWZWN0b3JzKFxuICAgICAgc3RhcnQuc2NhbGUuc2V0RnJvbU1hdHJpeFNjYWxlKHN0YXJ0TWF0NCksXG4gICAgICBlbmQuc2NhbGUuc2V0RnJvbU1hdHJpeFNjYWxlKGVuZE1hdDQpLFxuICAgICAgcHJvZ3Jlc3NcbiAgICApO1xuICAgIHJldHVybiBvdXRNYXQ0LmNvbXBvc2UoXG4gICAgICBpbnRlcnBvbGF0ZWQucG9zaXRpb24sXG4gICAgICBpbnRlcnBvbGF0ZWQucXVhdGVybmlvbixcbiAgICAgIGludGVycG9sYXRlZC5zY2FsZVxuICAgICk7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3Qgc3F1YXJlRGlzdGFuY2VCZXR3ZWVuID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBwb3NBID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3QgcG9zQiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIHJldHVybiBmdW5jdGlvbihvYmpBLCBvYmpCKSB7XG4gICAgb2JqQS51cGRhdGVNYXRyaWNlcygpO1xuICAgIG9iakIudXBkYXRlTWF0cmljZXMoKTtcbiAgICBwb3NBLnNldEZyb21NYXRyaXhDb2x1bW4ob2JqQS5tYXRyaXhXb3JsZCwgMyk7XG4gICAgcG9zQi5zZXRGcm9tTWF0cml4Q29sdW1uKG9iakIubWF0cml4V29ybGQsIDMpO1xuICAgIHJldHVybiBwb3NBLmRpc3RhbmNlVG9TcXVhcmVkKHBvc0IpO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWxtb3N0VW5pZm9ybVZlY3RvcjModiwgZXBzaWxvbkhhbGYgPSAwLjAwNSkge1xuICByZXR1cm4gTWF0aC5hYnModi54IC0gdi55KSA8IGVwc2lsb25IYWxmICYmIE1hdGguYWJzKHYueCAtIHYueikgPCBlcHNpbG9uSGFsZjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBhbG1vc3RFcXVhbChhLCBiLCBlcHNpbG9uID0gMC4wMSkge1xuICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpIDwgZXBzaWxvbjtcbn1cblxuZXhwb3J0IGNvbnN0IGFmZml4VG9Xb3JsZFVwID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBpblJvdGF0aW9uTWF0NCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGluRm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IG91dEZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCBvdXRTaWRlID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3Qgd29ybGRVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7IC8vIENvdWxkIGJlIGNhbGxlZCBcIm91dFVwXCJcbiAgY29uc3QgdiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IGluTWF0NENvcHkgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICByZXR1cm4gZnVuY3Rpb24gYWZmaXhUb1dvcmxkVXAoaW5NYXQ0LCBvdXRNYXQ0KSB7XG4gICAgaW5Sb3RhdGlvbk1hdDQuaWRlbnRpdHkoKS5leHRyYWN0Um90YXRpb24oaW5NYXQ0Q29weS5jb3B5KGluTWF0NCkpO1xuICAgIGluRm9yd2FyZC5zZXRGcm9tTWF0cml4Q29sdW1uKGluUm90YXRpb25NYXQ0LCAyKS5tdWx0aXBseVNjYWxhcigtMSk7XG4gICAgb3V0Rm9yd2FyZFxuICAgICAgLmNvcHkoaW5Gb3J3YXJkKVxuICAgICAgLnN1Yih2LmNvcHkoaW5Gb3J3YXJkKS5wcm9qZWN0T25WZWN0b3Iod29ybGRVcC5zZXQoMCwgMSwgMCkpKVxuICAgICAgLm5vcm1hbGl6ZSgpO1xuICAgIG91dFNpZGUuY3Jvc3NWZWN0b3JzKG91dEZvcndhcmQsIHdvcmxkVXApO1xuICAgIG91dE1hdDQubWFrZUJhc2lzKG91dFNpZGUsIHdvcmxkVXAsIG91dEZvcndhcmQubXVsdGlwbHlTY2FsYXIoLTEpKTtcbiAgICBvdXRNYXQ0LnNjYWxlKHYuc2V0RnJvbU1hdHJpeFNjYWxlKGluTWF0NENvcHkpKTtcbiAgICBvdXRNYXQ0LnNldFBvc2l0aW9uKHYuc2V0RnJvbU1hdHJpeENvbHVtbihpbk1hdDRDb3B5LCAzKSk7XG4gICAgcmV0dXJuIG91dE1hdDQ7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3QgY2FsY3VsYXRlQ2FtZXJhVHJhbnNmb3JtRm9yV2F5cG9pbnQgPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IHVwQWZmaXhlZENhbWVyYVRyYW5zZm9ybSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IHVwQWZmaXhlZFdheXBvaW50VHJhbnNmb3JtID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgZGV0YWNoRnJvbVdvcmxkVXAgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICByZXR1cm4gZnVuY3Rpb24gY2FsY3VsYXRlQ2FtZXJhVHJhbnNmb3JtRm9yV2F5cG9pbnQoY2FtZXJhVHJhbnNmb3JtLCB3YXlwb2ludFRyYW5zZm9ybSwgb3V0TWF0NCkge1xuICAgIGFmZml4VG9Xb3JsZFVwKGNhbWVyYVRyYW5zZm9ybSwgdXBBZmZpeGVkQ2FtZXJhVHJhbnNmb3JtKTtcbiAgICBkZXRhY2hGcm9tV29ybGRVcC5nZXRJbnZlcnNlKHVwQWZmaXhlZENhbWVyYVRyYW5zZm9ybSkubXVsdGlwbHkoY2FtZXJhVHJhbnNmb3JtKTtcbiAgICBhZmZpeFRvV29ybGRVcCh3YXlwb2ludFRyYW5zZm9ybSwgdXBBZmZpeGVkV2F5cG9pbnRUcmFuc2Zvcm0pO1xuICAgIG91dE1hdDQuY29weSh1cEFmZml4ZWRXYXlwb2ludFRyYW5zZm9ybSkubXVsdGlwbHkoZGV0YWNoRnJvbVdvcmxkVXApO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IGNhbGN1bGF0ZVZpZXdpbmdEaXN0YW5jZSA9IChmdW5jdGlvbigpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGNhbGN1bGF0ZVZpZXdpbmdEaXN0YW5jZShmb3YsIGFzcGVjdCwgYm94LCBjZW50ZXIsIHZyTW9kZSkge1xuICAgIGNvbnN0IGhhbGZZRXh0ZW50cyA9IE1hdGgubWF4KE1hdGguYWJzKGJveC5tYXgueSAtIGNlbnRlci55KSwgTWF0aC5hYnMoY2VudGVyLnkgLSBib3gubWluLnkpKTtcbiAgICBjb25zdCBoYWxmWEV4dGVudHMgPSBNYXRoLm1heChNYXRoLmFicyhib3gubWF4LnggLSBjZW50ZXIueCksIE1hdGguYWJzKGNlbnRlci54IC0gYm94Lm1pbi54KSk7XG4gICAgY29uc3QgaGFsZlZlcnRGT1YgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKGZvdiAvIDIpO1xuICAgIGNvbnN0IGhhbGZIb3JGT1YgPSBNYXRoLmF0YW4oTWF0aC50YW4oaGFsZlZlcnRGT1YpICogYXNwZWN0KSAqICh2ck1vZGUgPyAwLjUgOiAxKTtcbiAgICBjb25zdCBtYXJnaW4gPSAxLjA1O1xuICAgIGNvbnN0IGxlbmd0aDEgPSBNYXRoLmFicygoaGFsZllFeHRlbnRzICogbWFyZ2luKSAvIE1hdGgudGFuKGhhbGZWZXJ0Rk9WKSk7XG4gICAgY29uc3QgbGVuZ3RoMiA9IE1hdGguYWJzKChoYWxmWEV4dGVudHMgKiBtYXJnaW4pIC8gTWF0aC50YW4oaGFsZkhvckZPVikpO1xuICAgIGNvbnN0IGxlbmd0aDMgPSBNYXRoLmFicyhib3gubWF4LnogLSBjZW50ZXIueikgKyBNYXRoLm1heChsZW5ndGgxLCBsZW5ndGgyKTtcbiAgICBjb25zdCBsZW5ndGggPSB2ck1vZGUgPyBNYXRoLm1heCgwLjI1LCBsZW5ndGgzKSA6IGxlbmd0aDM7XG4gICAgcmV0dXJuIGxlbmd0aCB8fCAxLjI1O1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IHJvdGF0ZUluUGxhY2VBcm91bmRXb3JsZFVwID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBpbk1hdDRDb3B5ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3Qgc3RhcnRSb3RhdGlvbiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGVuZFJvdGF0aW9uID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgdiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIHJldHVybiBmdW5jdGlvbiByb3RhdGVJblBsYWNlQXJvdW5kV29ybGRVcChpbk1hdDQsIHRoZXRhLCBvdXRNYXQ0KSB7XG4gICAgaW5NYXQ0Q29weS5jb3B5KGluTWF0NCk7XG4gICAgcmV0dXJuIG91dE1hdDRcbiAgICAgIC5jb3B5KGVuZFJvdGF0aW9uLm1ha2VSb3RhdGlvblkodGhldGEpLm11bHRpcGx5KHN0YXJ0Um90YXRpb24uZXh0cmFjdFJvdGF0aW9uKGluTWF0NENvcHkpKSlcbiAgICAgIC5zY2FsZSh2LnNldEZyb21NYXRyaXhTY2FsZShpbk1hdDRDb3B5KSlcbiAgICAgIC5zZXRQb3NpdGlvbih2LnNldEZyb21NYXRyaXhQb3NpdGlvbihpbk1hdDRDb3B5KSk7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3QgY2hpbGRNYXRjaCA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgaW52ZXJzZVBhcmVudFdvcmxkID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgY2hpbGRSZWxhdGl2ZVRvUGFyZW50ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgY2hpbGRJbnZlcnNlID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgbmV3UGFyZW50TWF0cml4ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgLy8gdHJhbnNmb3JtIHRoZSBwYXJlbnQgc3VjaCB0aGF0IGl0cyBjaGlsZCBtYXRjaGVzIHRoZSB0YXJnZXRcbiAgcmV0dXJuIGZ1bmN0aW9uIGNoaWxkTWF0Y2gocGFyZW50LCBjaGlsZCwgdGFyZ2V0KSB7XG4gICAgcGFyZW50LnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgaW52ZXJzZVBhcmVudFdvcmxkLmdldEludmVyc2UocGFyZW50Lm1hdHJpeFdvcmxkKTtcbiAgICBjaGlsZC51cGRhdGVNYXRyaWNlcygpO1xuICAgIGNoaWxkUmVsYXRpdmVUb1BhcmVudC5tdWx0aXBseU1hdHJpY2VzKGludmVyc2VQYXJlbnRXb3JsZCwgY2hpbGQubWF0cml4V29ybGQpO1xuICAgIGNoaWxkSW52ZXJzZS5nZXRJbnZlcnNlKGNoaWxkUmVsYXRpdmVUb1BhcmVudCk7XG4gICAgbmV3UGFyZW50TWF0cml4Lm11bHRpcGx5TWF0cmljZXModGFyZ2V0LCBjaGlsZEludmVyc2UpO1xuICAgIHNldE1hdHJpeFdvcmxkKHBhcmVudCwgbmV3UGFyZW50TWF0cml4KTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmF2ZXJzZUFuaW1hdGlvblRhcmdldHMocm9vdE9iamVjdCwgYW5pbWF0aW9ucywgY2FsbGJhY2spIHtcbiAgaWYgKGFuaW1hdGlvbnMgJiYgYW5pbWF0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgZm9yIChjb25zdCBhbmltYXRpb24gb2YgYW5pbWF0aW9ucykge1xuICAgICAgZm9yIChjb25zdCB0cmFjayBvZiBhbmltYXRpb24udHJhY2tzKSB7XG4gICAgICAgIGNvbnN0IHsgbm9kZU5hbWUgfSA9IFRIUkVFLlByb3BlcnR5QmluZGluZy5wYXJzZVRyYWNrTmFtZSh0cmFjay5uYW1lKTtcbiAgICAgICAgbGV0IGFuaW1hdGVkTm9kZSA9IHJvb3RPYmplY3QuZ2V0T2JqZWN0QnlQcm9wZXJ0eShcInV1aWRcIiwgbm9kZU5hbWUpO1xuXG4gICAgICAgIGlmICghYW5pbWF0ZWROb2RlKSB7XG4gICAgICAgICAgYW5pbWF0ZWROb2RlID0gcm9vdE9iamVjdC5nZXRPYmplY3RCeU5hbWUobm9kZU5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFuaW1hdGVkTm9kZSkge1xuICAgICAgICAgIGNhbGxiYWNrKGFuaW1hdGVkTm9kZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7XG4gICAgc2V0TWF0cml4V29ybGRcbn0gZnJvbSBcIi4uL3V0aWxzL3RocmVlLXV0aWxzXCI7XG5pbXBvcnQge1xuICAgIGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnRcbn0gZnJvbSBcIi4uL3V0aWxzL3NjZW5lLWdyYXBoXCI7XG5cbmNvbnN0IGNhbGN1bGF0ZVBsYW5lTWF0cml4ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBwbGFuZU1hdHJpeCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgY29uc3QgcGxhbmVVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgY29uc3QgcGxhbmVGb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBwbGFuZVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBwbGFuZVBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBjYW1Qb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gY2FsY3VsYXRlUGxhbmVNYXRyaXgoY2FtZXJhLCBidXR0b24pIHtcbiAgICAgICAgY2FtZXJhLnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgICAgIGNhbVBvc2l0aW9uLnNldEZyb21NYXRyaXhQb3NpdGlvbihjYW1lcmEubWF0cml4V29ybGQpO1xuICAgICAgICBidXR0b24udXBkYXRlTWF0cmljZXMoKTtcbiAgICAgICAgcGxhbmVQb3NpdGlvbi5zZXRGcm9tTWF0cml4UG9zaXRpb24oYnV0dG9uLm1hdHJpeFdvcmxkKTtcbiAgICAgICAgcGxhbmVGb3J3YXJkLnN1YlZlY3RvcnMocGxhbmVQb3NpdGlvbiwgY2FtUG9zaXRpb24pO1xuICAgICAgICBwbGFuZUZvcndhcmQueSA9IDA7XG4gICAgICAgIHBsYW5lRm9yd2FyZC5ub3JtYWxpemUoKTtcbiAgICAgICAgcGxhbmVVcC5zZXQoMCwgMSwgMCk7XG4gICAgICAgIHBsYW5lUmlnaHQuY3Jvc3NWZWN0b3JzKHBsYW5lRm9yd2FyZCwgcGxhbmVVcCk7XG4gICAgICAgIHBsYW5lTWF0cml4Lm1ha2VCYXNpcyhwbGFuZVJpZ2h0LCBwbGFuZVVwLCBwbGFuZUZvcndhcmQubXVsdGlwbHlTY2FsYXIoLTEpKTtcbiAgICAgICAgcGxhbmVNYXRyaXguZWxlbWVudHNbMTJdID0gcGxhbmVQb3NpdGlvbi54O1xuICAgICAgICBwbGFuZU1hdHJpeC5lbGVtZW50c1sxM10gPSBwbGFuZVBvc2l0aW9uLnk7XG4gICAgICAgIHBsYW5lTWF0cml4LmVsZW1lbnRzWzE0XSA9IHBsYW5lUG9zaXRpb24uejtcbiAgICAgICAgcmV0dXJuIHBsYW5lTWF0cml4O1xuICAgIH07XG59KSgpO1xuXG5jb25zdCBwbGFuZUZvckxlZnRDdXJzb3IgPSBuZXcgVEhSRUUuTWVzaChcbiAgICBuZXcgVEhSRUUuUGxhbmVCdWZmZXJHZW9tZXRyeSgxMDAwMDAsIDEwMDAwMCwgMiwgMiksXG4gICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgd2lyZWZyYW1lOiBmYWxzZSxcbiAgICAgICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIG9wYWNpdHk6IDAuM1xuICAgIH0pXG4pO1xuY29uc3QgcGxhbmVGb3JSaWdodEN1cnNvciA9IG5ldyBUSFJFRS5NZXNoKFxuICAgIG5ldyBUSFJFRS5QbGFuZUJ1ZmZlckdlb21ldHJ5KDEwMDAwMCwgMTAwMDAwLCAyLCAyKSxcbiAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICB3aXJlZnJhbWU6IGZhbHNlLFxuICAgICAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICAgICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgICAgb3BhY2l0eTogMC4zXG4gICAgfSlcbik7XG5cbmV4cG9ydCBjbGFzcyBIYW5kbGVJbnRlcmFjdGlvbiB7XG4gICAgY29uc3RydWN0b3IoZWwpIHtcbiAgICAgICAgdGhpcy5lbCA9IGVsO1xuXG4gICAgICAgIHRoaXMuaXNEcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRyYWdJbnRlcmFjdG9yID0gbnVsbDtcbiAgICAgICAgdGhpcy5wbGFuZVJvdGF0aW9uID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgICAgICAgdGhpcy5wbGFuZVVwID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5wbGFuZVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25zID0gW107XG4gICAgICAgIHRoaXMuaW5pdGlhbEludGVyc2VjdGlvblBvaW50ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25Qb2ludCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMuZGVsdGEgPSB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMFxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9iamVjdE1hdHJpeCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgICAgIHRoaXMuZHJhZ1ZlY3RvciA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgICAgICAgdGhpcy5jYW1Qb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMub2JqZWN0UG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLm9iamVjdFRvQ2FtID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICB9XG5cbiAgICBnZXRJbnRlcmFjdG9ycyhvYmopIHtcbiAgICAgICAgbGV0IHRvZ2dsaW5nID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXNbXCJodWJzLXN5c3RlbXNcIl0uY3Vyc29yVG9nZ2xpbmdTeXN0ZW07XG5cbiAgICAgICAgLy8gbW9yZSBvciBsZXNzIGNvcGllZCBmcm9tIFwiaG92ZXJhYmxlLXZpc3VhbHMuanNcIiBpbiBodWJzXG4gICAgICAgIGNvbnN0IGludGVyYWN0aW9uID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMuaW50ZXJhY3Rpb247XG4gICAgICAgIHZhciBwYXNzdGhydUludGVyYWN0b3IgPSBbXVxuXG4gICAgICAgIGxldCBpbnRlcmFjdG9yT25lLCBpbnRlcmFjdG9yVHdvO1xuICAgICAgICBpZiAoIWludGVyYWN0aW9uLnJlYWR5KSByZXR1cm47IC8vRE9NQ29udGVudFJlYWR5IHdvcmthcm91bmRcblxuICAgICAgICAvLyBUT0RPOiAgbWF5IHdhbnQgdG8gbG9vayB0byBzZWUgdGhlIGhvdmVyZWQgb2JqZWN0cyBhcmUgY2hpbGRyZW4gb2Ygb2JqPz9cbiAgICAgICAgbGV0IGhvdmVyRWwgPSBvYmpcbiAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yOiBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRIYW5kLmVudGl0eS5vYmplY3QzRCxcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiBpbnRlcmFjdGlvbi5sZWZ0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICkge1xuICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IHtcbiAgICAgICAgICAgICAgICBjdXJzb3I6IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0QsXG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogaW50ZXJhY3Rpb24ubGVmdEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl1cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdG9yT25lKSB7XG4gICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaChpbnRlcmFjdG9yT25lKVxuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICkge1xuICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IHtcbiAgICAgICAgICAgICAgICBjdXJzb3I6IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNELFxuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6IGludGVyYWN0aW9uLnJpZ2h0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yOiBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0QsXG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogaW50ZXJhY3Rpb24ucmlnaHRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGludGVyYWN0b3JUd28pIHtcbiAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKGludGVyYWN0b3JUd28pXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBhc3N0aHJ1SW50ZXJhY3RvclxuICAgIH1cblxuICAgIGdldFJlZnMoKSB7XG4gICAgICAgIGlmICghdGhpcy5kaWRHZXRPYmplY3RSZWZlcmVuY2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpZEdldE9iamVjdFJlZmVyZW5jZXMgPSB0cnVlO1xuICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcblxuICAgICAgICAgICAgLy8gdGhpcy5sZWZ0RXZlbnRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGVmdC1jdXJzb3JcIikub2JqZWN0M0Q7XG4gICAgICAgICAgICAvLyB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsZWZ0LWN1cnNvci1jb250cm9sbGVyXCIpO1xuICAgICAgICAgICAgLy8gdGhpcy5sZWZ0UmF5Y2FzdGVyID0gdGhpcy5sZWZ0Q3Vyc29yQ29udHJvbGxlci5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl0ucmF5Y2FzdGVyO1xuICAgICAgICAgICAgLy8gdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJpZ2h0LWN1cnNvci1jb250cm9sbGVyXCIpO1xuICAgICAgICAgICAgLy8gdGhpcy5yaWdodFJheWNhc3RlciA9IHRoaXMucmlnaHRDdXJzb3JDb250cm9sbGVyLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXS5yYXljYXN0ZXI7XG4gICAgICAgICAgICB0aGlzLmxlZnRFdmVudGVyID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIgPSBpbnRlcmFjdGlvbi5sZWZ0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXTtcbiAgICAgICAgICAgIHRoaXMubGVmdFJheWNhc3RlciA9IHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIucmF5Y2FzdGVyO1xuICAgICAgICAgICAgdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIgPSBpbnRlcmFjdGlvbi5yaWdodEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl07XG4gICAgICAgICAgICB0aGlzLnJpZ2h0UmF5Y2FzdGVyID0gdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIucmF5Y2FzdGVyO1xuXG4gICAgICAgICAgICB0aGlzLnZpZXdpbmdDYW1lcmEgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZpZXdpbmctY2FtZXJhXCIpLm9iamVjdDNETWFwLmNhbWVyYTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldEludGVyc2VjdGlvbihpbnRlcmFjdG9yLCB0YXJnZXRzKSB7XG4gICAgICAgIHRoaXMuZ2V0UmVmcygpO1xuICAgICAgICBsZXQgb2JqZWN0M0QgPSBpbnRlcmFjdG9yLmN1cnNvclxuICAgICAgICBsZXQgcmF5Y2FzdGVyID0gb2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyB0aGlzLmxlZnRSYXljYXN0ZXIgOiB0aGlzLnJpZ2h0UmF5Y2FzdGVyO1xuXG4gICAgICAgIGxldCBpbnRlcnNlY3RzID0gcmF5Y2FzdGVyLmludGVyc2VjdE9iamVjdHModGFyZ2V0cywgdHJ1ZSk7XG4gICAgICAgIGlmIChpbnRlcnNlY3RzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiBpbnRlcnNlY3RzWzBdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHN0YXJ0RHJhZyhlKSB7XG4gICAgICAgIGlmICh0aGlzLmlzRHJhZ2dpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmdldFJlZnMoKTtcblxuICAgICAgICB0aGlzLnBsYW5lID0gZS5vYmplY3QzRCA9PT0gdGhpcy5sZWZ0RXZlbnRlciA/IHBsYW5lRm9yTGVmdEN1cnNvciA6IHBsYW5lRm9yUmlnaHRDdXJzb3I7XG5cbiAgICAgICAgc2V0TWF0cml4V29ybGQodGhpcy5wbGFuZSwgY2FsY3VsYXRlUGxhbmVNYXRyaXgodGhpcy52aWV3aW5nQ2FtZXJhLCB0aGlzLmVsLm9iamVjdDNEKSk7XG4gICAgICAgIHRoaXMucGxhbmVSb3RhdGlvbi5leHRyYWN0Um90YXRpb24odGhpcy5wbGFuZS5tYXRyaXhXb3JsZCk7XG4gICAgICAgIHRoaXMucGxhbmVVcC5zZXQoMCwgMSwgMCkuYXBwbHlNYXRyaXg0KHRoaXMucGxhbmVSb3RhdGlvbik7XG4gICAgICAgIHRoaXMucGxhbmVSaWdodC5zZXQoMSwgMCwgMCkuYXBwbHlNYXRyaXg0KHRoaXMucGxhbmVSb3RhdGlvbik7XG4gICAgICAgIHRoaXMucmF5Y2FzdGVyID0gZS5vYmplY3QzRCA9PT0gdGhpcy5sZWZ0RXZlbnRlciA/IHRoaXMubGVmdFJheWNhc3RlciA6IHRoaXMucmlnaHRSYXljYXN0ZXI7XG4gICAgICAgIGNvbnN0IGludGVyc2VjdGlvbiA9IHRoaXMucmF5Y2FzdE9uUGxhbmUoKTtcblxuICAgICAgICAvLyBzaG91bGRuJ3QgaGFwcGVuLCBidXQgd2Ugc2hvdWxkIGNoZWNrXG4gICAgICAgIGlmICghaW50ZXJzZWN0aW9uKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5pc0RyYWdnaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5kcmFnSW50ZXJhY3RvciA9IHtcbiAgICAgICAgICAgIGN1cnNvcjogZS5vYmplY3QzRCxcbiAgICAgICAgICAgIGNvbnRyb2xsZXI6IGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyIDogdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIsXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmluaXRpYWxJbnRlcnNlY3Rpb25Qb2ludC5jb3B5KGludGVyc2VjdGlvbi5wb2ludCk7XG4gICAgICAgIHRoaXMuaW5pdGlhbERpc3RhbmNlVG9PYmplY3QgPSB0aGlzLm9iamVjdFRvQ2FtXG4gICAgICAgICAgICAuc3ViVmVjdG9ycyhcbiAgICAgICAgICAgICAgICB0aGlzLmNhbVBvc2l0aW9uLnNldEZyb21NYXRyaXhQb3NpdGlvbih0aGlzLnZpZXdpbmdDYW1lcmEubWF0cml4V29ybGQpLFxuICAgICAgICAgICAgICAgIHRoaXMub2JqZWN0UG9zaXRpb24uc2V0RnJvbU1hdHJpeFBvc2l0aW9uKHRoaXMuZWwub2JqZWN0M0QubWF0cml4V29ybGQpXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAubGVuZ3RoKCk7XG4gICAgICAgIHRoaXMuaW50ZXJzZWN0aW9uUmlnaHQgPSAwO1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvblVwID0gMDtcbiAgICAgICAgdGhpcy5kZWx0YSA9IHtcbiAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICB5OiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBlbmREcmFnKGUpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlzRHJhZ2dpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgICAoZS5vYmplY3QzRCA9PT0gdGhpcy5sZWZ0RXZlbnRlciAmJiB0aGlzLnJheWNhc3RlciA9PT0gdGhpcy5sZWZ0UmF5Y2FzdGVyKSB8fFxuICAgICAgICAgICAgKGUub2JqZWN0M0QgIT09IHRoaXMubGVmdEV2ZW50ZXIgJiYgdGhpcy5yYXljYXN0ZXIgPT09IHRoaXMucmlnaHRSYXljYXN0ZXIpXG4gICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5pc0RyYWdnaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmRyYWdJbnRlcmFjdG9yID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJheWNhc3RPblBsYW5lKCkge1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvbnMubGVuZ3RoID0gMDtcbiAgICAgICAgY29uc3QgZmFyID0gdGhpcy5yYXljYXN0ZXIuZmFyO1xuICAgICAgICB0aGlzLnJheWNhc3Rlci5mYXIgPSAxMDAwO1xuICAgICAgICB0aGlzLnBsYW5lLnJheWNhc3QodGhpcy5yYXljYXN0ZXIsIHRoaXMuaW50ZXJzZWN0aW9ucyk7XG4gICAgICAgIHRoaXMucmF5Y2FzdGVyLmZhciA9IGZhcjtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW50ZXJzZWN0aW9uc1swXTtcbiAgICB9XG5cbiAgICBkcmFnKCkge1xuICAgICAgICBpZiAoIXRoaXMuaXNEcmFnZ2luZykgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IGludGVyc2VjdGlvbiA9IHRoaXMucmF5Y2FzdE9uUGxhbmUoKTtcbiAgICAgICAgaWYgKCFpbnRlcnNlY3Rpb24pIHJldHVybiBudWxsO1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvblBvaW50LmNvcHkoaW50ZXJzZWN0aW9uLnBvaW50KTtcbiAgICAgICAgdGhpcy5kcmFnVmVjdG9yLnN1YlZlY3RvcnModGhpcy5pbnRlcnNlY3Rpb25Qb2ludCwgdGhpcy5pbml0aWFsSW50ZXJzZWN0aW9uUG9pbnQpO1xuICAgICAgICB0aGlzLmRlbHRhLnggPSB0aGlzLmRyYWdWZWN0b3IuZG90KHRoaXMucGxhbmVVcCk7XG4gICAgICAgIHRoaXMuZGVsdGEueSA9IHRoaXMuZHJhZ1ZlY3Rvci5kb3QodGhpcy5wbGFuZVJpZ2h0KTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZHJhZ1ZlY3RvcjtcbiAgICB9XG59XG5cblxuLy8gdGVtcGxhdGVcblxuZXhwb3J0IGZ1bmN0aW9uIGludGVyYWN0aXZlQ29tcG9uZW50VGVtcGxhdGUoY29tcG9uZW50TmFtZSkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHN0YXJ0SW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwuY2xhc3NOYW1lXG4gICAgICAgICAgICB0aGlzLnJlbGF0aXZlU2l6ZSA9IDE7XG4gICAgICAgICAgICB0aGlzLmlzRHJhZ2dhYmxlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlzSW50ZXJhY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuaXNOZXR3b3JrZWQgPSBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBmaW5pc2hJbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgICAgIHJvb3QgJiYgcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIChldikgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxJbml0KClcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZVRlbXBsYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBudWxsXG4gICAgXG4gICAgICAgICAgICBpZiAodGhpcy5pc05ldHdvcmtlZCAmJiB0aGlzLm5ldEVudGl0eS5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5ldEVudGl0eSlcbiAgICAgICAgICAgIH0gICAgXG4gICAgICAgIH0sXG5cbiAgICAgICAgaW50ZXJuYWxJbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyBlYWNoIHRpbWUgd2UgbG9hZCBhIGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAgICAgLy8gYSBuZXcgbmV0d29ya2VkIGNvbXBvbmVudC4gIFRoaXMgaXMgZmluZSwgc2luY2UgdGhlIG5ldHdvcmtlZCBJZCBcbiAgICAgICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgICAgICAvLyBjb21wb25lbnQgaW4gU3Bva2UuICBJdCBkb2VzIG1lYW4gdGhhdCBpZiB3ZSBoYXZlXG4gICAgICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgICAgICAvLyB0aGUgc2NlbmUgdmlhIGEgLmdsYiwgaXQgbXVzdCBoYXZlIGEgdmFsaWQgbmFtZSBwYXJhbWV0ZXIgaW5zaWRlIGl0LlxuICAgICAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgICAgICBsZXQgbG9hZGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGxldHMgbG9hZCBzb21ldGhpbmcgZXh0ZXJuYWxseSwgbGlrZSBhIGpzb24gY29uZmlnIGZpbGVcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWREYXRhKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIGNyZWF0aW5nIHRoaXMgYXMgcGFydCBvZiBhIEdMVEYgbG9hZCwgdGhlIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcGFyZW50IGEgZmV3IHN0ZXBzIHVwIHdpbGwgYmUgbmV0d29ya2VkLiBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gbnVsbFxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxpemVEYXRhKClcbiAgICAgICAgICAgICAgICAgICAgLy8gbGV0cyBmaWd1cmUgb3V0IHRoZSBzY2FsZSwgYnkgc2NhbGluZyB0byBmaWxsIHRoZSBhIDF4MW0gc3F1YXJlLCB0aGF0IGhhcyBhbHNvXG4gICAgICAgICAgICAgICAgICAgIC8vIHBvdGVudGlhbGx5IGJlZW4gc2NhbGVkIGJ5IHRoZSBwYXJlbnRzIHBhcmVudCBub2RlLiBJZiB3ZSBzY2FsZSB0aGUgZW50aXR5IGluIHNwb2tlLFxuICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIHdoZXJlIHRoZSBzY2FsZSBpcyBzZXQuICBJZiB3ZSBkcm9wIGEgbm9kZSBpbiBhbmQgc2NhbGUgaXQsIHRoZSBzY2FsZSBpcyBhbHNvXG4gICAgICAgICAgICAgICAgICAgIC8vIHNldCB0aGVyZS5cblxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBuZWVkIHRvIGZpbmQgZW52aXJvbm1lbnQtc2NlbmUsIGdvIGRvd24gdHdvIGxldmVscyB0byB0aGUgZ3JvdXAgYWJvdmUgXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSBub2RlcyBpbiB0aGUgc2NlbmUuICBUaGVuIGFjY3VtdWxhdGUgdGhlIHNjYWxlcyB1cCBmcm9tIHRoaXMgbm9kZSB0b1xuICAgICAgICAgICAgICAgICAgICAvLyB0aGF0IG5vZGUuICBUaGlzIHdpbGwgYWNjb3VudCBmb3IgZ3JvdXBzLCBhbmQgbmVzdGluZy5cblxuICAgICAgICAgICAgICAgICAgICB2YXIgd2lkdGggPSAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhdHRhY2hlZCB0byBhbiBpbWFnZSBpbiBzcG9rZSwgc28gdGhlIGltYWdlIG1lc2ggaXMgc2l6ZSAxIGFuZCBpcyBzY2FsZWQgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2FsZUkueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlSS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQUk9CQUJMWSBET05UIE5FRUQgVE8gU1VQUE9SVCBUSElTIEFOWU1PUkVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGl0J3MgZW1iZWRkZWQgaW4gYSBzaW1wbGUgZ2x0ZiBtb2RlbDsgIG90aGVyIG1vZGVscyBtYXkgbm90IHdvcmtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGFzc3VtZSBpdCdzIGF0IHRoZSB0b3AgbGV2ZWwgbWVzaCwgYW5kIHRoYXQgdGhlIG1vZGVsIGl0c2VsZiBpcyBzY2FsZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGJveCA9IG1lc2guZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSAoYm94Lm1heC54IC0gYm94Lm1pbi54KSAqIG1lc2guc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IChib3gubWF4LnkgLSBib3gubWluLnkpICogbWVzaC5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoU2NhbGUgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBtZXNoU2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IG1lc2hTY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSB0aGUgcm9vdCBnbHRmIHNjYWxlLlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmVudDIgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLm9iamVjdDNEXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCAqPSBwYXJlbnQyLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCAqPSBwYXJlbnQyLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbih3aWR0aCAqIHRoaXMucmVsYXRpdmVTaXplLCBoZWlnaHQgKiB0aGlzLnJlbGF0aXZlU2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBzY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBzY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB6OiBzY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyB0aGVyZSBtaWdodCBiZSBzb21lIGVsZW1lbnRzIGFscmVhZHksIGxpa2UgdGhlIGN1YmUgd2UgY3JlYXRlZCBpbiBibGVuZGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCBhdHRhY2hlZCB0aGlzIGNvbXBvbmVudCB0bywgc28gaGlkZSB0aGVtIGlmIHRoZXkgYXJlIHRoZXJlLlxuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgaW4gb3VyIGNvbnRhaW5lclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86ICB3ZSBhcmUgZ29pbmcgdG8gaGF2ZSB0byBtYWtlIHN1cmUgdGhpcyB3b3JrcyBpZiBcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGNvbXBvbmVudCBpcyBPTiBhbiBpbnRlcmFjdGFibGUgKGxpa2UgYW4gaW1hZ2UpXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbiA9IG5ldyBIYW5kbGVJbnRlcmFjdGlvbih0aGlzLmVsKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSB0aGUgb2JqZWN0IGNsaWNrYWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBvYmplY3QgXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNsaWNrZWQgPSB0aGlzLmNsaWNrZWQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmNsaWNrZWQpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzRHJhZ2dhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgYXJlbid0IGdvaW5nIHRvIHJlYWxseSBkZWFsIHdpdGggdGhpcyB0aWxsIHdlIGhhdmUgYSB1c2UgY2FzZSwgYnV0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgY2FuIHNldCBpdCB1cCBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWdzJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGVBY3Rpb25CdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzSG9sZGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhvbGRhYmxlQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNwZWN0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhZ1N0YXJ0ID0gdGhpcy5kcmFnU3RhcnQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhZ0VuZCA9IHRoaXMuZHJhZ0VuZC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLWRvd24nLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhZ1N0YXJ0KGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2hvbGRhYmxlLWJ1dHRvbi11cCcsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmFnRW5kKGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvL3RoaXMucmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TCA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ob3ZlclJheVIgPSBuZXcgVEhSRUUuUmF5KClcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vIGludGVyYWN0aXZpdHksIHBsZWFzZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaW50ZXJhY3RhYmxlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcImlzLXJlbW90ZS1ob3Zlci10YXJnZXRcIilcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IHRoaXMgU0hPVUxEIHdvcmsgYnV0IG1ha2Ugc3VyZSBpdCB3b3JrcyBpZiB0aGUgZWwgd2UgYXJlIG9uXG4gICAgICAgICAgICAgICAgICAgIC8vIGlzIG5ldHdvcmtlZCwgc3VjaCBhcyB3aGVuIGF0dGFjaGVkIHRvIGFuIGltYWdlXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuaGFzQXR0cmlidXRlKFwibmV0d29ya2VkXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNOZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gZmluZHMgYW4gZXhpc3RpbmcgY29weSBvZiB0aGUgTmV0d29ya2VkIEVudGl0eSAoaWYgd2UgYXJlIG5vdCB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZpcnN0IGNsaWVudCBpbiB0aGUgcm9vbSBpdCB3aWxsIGV4aXN0IGluIG90aGVyIGNsaWVudHMgYW5kIGJlIGNyZWF0ZWQgYnkgTkFGKVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgY3JlYXRlIGFuIGVudGl0eSBpZiB3ZSBhcmUgZmlyc3QuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gZnVuY3Rpb24gKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBiZSBwYXJ0IG9mIGEgTmV0d29ya2VkIEdMVEYgaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIHBpbm5lZCBhbmQgbG9hZGVkIHdoZW4gd2UgZW50ZXIgdGhlIHJvb20uICBVc2UgdGhlIG5ldHdvcmtlZCBwYXJlbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBwbHVzIGEgZGlzYW1iaWd1YXRpbmcgYml0IG9mIHRleHQgdG8gY3JlYXRlIGEgdW5pcXVlIElkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IE5BRi51dGlscy5nZXROZXR3b3JrSWQobmV0d29ya2VkRWwpICsgXCItXCIgKyBjb21wb25lbnROYW1lO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIG5lZWQgdG8gY3JlYXRlIGFuIGVudGl0eSwgdXNlIHRoZSBzYW1lIHBlcnNpc3RlbmNlIGFzIG91clxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrIGVudGl0eSAodHJ1ZSBpZiBwaW5uZWQsIGZhbHNlIGlmIG5vdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudCA9IGVudGl0eS5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLnBlcnNpc3RlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBvbmx5IGhhcHBlbnMgaWYgdGhpcyBjb21wb25lbnQgaXMgb24gYSBzY2VuZSBmaWxlLCBzaW5jZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZWxlbWVudHMgb24gdGhlIHNjZW5lIGFyZW4ndCBuZXR3b3JrZWQuICBTbyBsZXQncyBhc3N1bWUgZWFjaCBlbnRpdHkgaW4gdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNjZW5lIHdpbGwgaGF2ZSBhIHVuaXF1ZSBuYW1lLiAgQWRkaW5nIGEgYml0IG9mIHRleHQgc28gd2UgY2FuIGZpbmQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIERPTSB3aGVuIGRlYnVnZ2luZy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0SWQgPSB0aGlzLmZ1bGxOYW1lLnJlcGxhY2VBbGwoXCJfXCIsIFwiLVwiKSArIFwiLVwiICsgY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgbmV0d29ya2VkIGVudGl0eSB3ZSBjcmVhdGUgZm9yIHRoaXMgY29tcG9uZW50IGFscmVhZHkgZXhpc3RzLiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UsIGNyZWF0ZSBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gTk9URTogaXQgaXMgY3JlYXRlZCBvbiB0aGUgc2NlbmUsIG5vdCBhcyBhIGNoaWxkIG9mIHRoaXMgZW50aXR5LCBiZWNhdXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBOQUYgY3JlYXRlcyByZW1vdGUgZW50aXRpZXMgaW4gdGhlIHNjZW5lLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5BRi5lbnRpdGllcy5oYXNFbnRpdHkobmV0SWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IE5BRi5lbnRpdGllcy5nZXRFbnRpdHkobmV0SWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9yZSB0aGUgbWV0aG9kIHRvIHJldHJpZXZlIHRoZSBkYXRhIG9uIHRoaXMgZW50aXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eS5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBcIm5ldHdvcmtlZFwiIGNvbXBvbmVudCBzaG91bGQgaGF2ZSBwZXJzaXN0ZW50PXRydWUsIHRoZSB0ZW1wbGF0ZSBhbmQgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmtJZCBzZXQsIG93bmVyIHNldCB0byBcInNjZW5lXCIgKHNvIHRoYXQgaXQgZG9lc24ndCB1cGRhdGUgdGhlIHJlc3Qgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHdvcmxkIHdpdGggaXQncyBpbml0aWFsIGRhdGEsIGFuZCBzaG91bGQgTk9UIHNldCBjcmVhdG9yICh0aGUgc3lzdGVtIHdpbGwgZG8gdGhhdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LnNldEF0dHJpYnV0ZSgnbmV0d29ya2VkJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGU6IFwiI1wiICsgY29tcG9uZW50TmFtZSArIFwiLWRhdGEtbWVkaWFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQ6IHBlcnNpc3RlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvd25lcjogXCJzY2VuZVwiLCAvLyBzbyB0aGF0IG91ciBpbml0aWFsIHZhbHVlIGRvZXNuJ3Qgb3ZlcndyaXRlIG90aGVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya0lkOiBuZXRJZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFwcGVuZENoaWxkKGVudGl0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2F2ZSBhIHBvaW50ZXIgdG8gdGhlIG5ldHdvcmtlZCBlbnRpdHkgYW5kIHRoZW4gd2FpdCBmb3IgaXQgdG8gYmUgZnVsbHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCBiZWZvcmUgZ2V0dGluZyBhIHBvaW50ZXIgdG8gdGhlIGFjdHVhbCBuZXR3b3JrZWQgY29tcG9uZW50IGluIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkgPSBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLm5ldEVudGl0eSkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jID0gbmV0d29ya2VkRWwuY29tcG9uZW50c1tjb21wb25lbnROYW1lICsgXCItZGF0YVwiXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLmVsKS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eShuZXR3b3JrZWRFbClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkID0gdGhpcy5zZXR1cE5ldHdvcmtlZC5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWV0aG9kIGhhbmRsZXMgdGhlIGRpZmZlcmVudCBzdGFydHVwIGNhc2VzOlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmUsIE5BRiB3aWxsIGJlIGNvbm5lY3RlZCBhbmQgd2UgY2FuIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBpbW1lZGlhdGVseSBpbml0aWFsaXplXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIGlzIGluIHRoZSByb29tIHNjZW5lIG9yIHBpbm5lZCwgaXQgd2lsbCBsaWtlbHkgYmUgY3JlYXRlZFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBiZWZvcmUgTkFGIGlzIHN0YXJ0ZWQgYW5kIGNvbm5lY3RlZCwgc28gd2Ugd2FpdCBmb3IgYW4gZXZlbnQgdGhhdCBpc1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBmaXJlZCB3aGVuIEh1YnMgaGFzIHN0YXJ0ZWQgTkFGXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmNvbm5lY3Rpb24gJiYgTkFGLmNvbm5lY3Rpb24uaXNDb25uZWN0ZWQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2RpZENvbm5lY3RUb05ldHdvcmtlZFNjZW5lJywgdGhpcy5zZXR1cE5ldHdvcmtlZClcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBpZiBhdHRhY2hlZCB0byBhIG5vZGUgd2l0aCBhIG1lZGlhLWxvYWRlciBjb21wb25lbnQsIHRoaXMgbWVhbnMgd2UgYXR0YWNoZWQgdGhpcyBjb21wb25lbnRcbiAgICAgICAgICAgIC8vIHRvIGEgbWVkaWEgb2JqZWN0IGluIFNwb2tlLiAgV2Ugc2hvdWxkIHdhaXQgdGlsbCB0aGUgb2JqZWN0IGlzIGZ1bGx5IGxvYWRlZC4gIFxuICAgICAgICAgICAgLy8gT3RoZXJ3aXNlLCBpdCB3YXMgYXR0YWNoZWQgdG8gc29tZXRoaW5nIGluc2lkZSBhIEdMVEYgKHByb2JhYmx5IGluIGJsZW5kZXIpXG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hZGRFdmVudExpc3RlbmVyKFwibWVkaWEtbG9hZGVkXCIsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbG9hZGVyKClcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICAgIG9uY2U6IHRydWVcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJTaGFyZWRBRlJBTUVDb21wb25lbnRzKGNvbXBvbmVudE5hbWUpIHtcbiAgICAvL1xuICAgIC8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuICAgIC8vIGNoYW5nZSB0aGUgc3RhdGUgd2hlbiBhcHByb3ByaWF0ZS4gV2UgY291bGQgc2V0IHRoaXMgdXAgdG8gc2lnbmFsIHRoZSBjb21wb25lbnQgYWJvdmUgd2hlblxuICAgIC8vIHNvbWV0aGluZyBoYXMgY2hhbmdlZCwgaW5zdGVhZCBvZiBoYXZpbmcgdGhlIGNvbXBvbmVudCBhYm92ZSBwb2xsIGVhY2ggZnJhbWUuXG4gICAgLy9cblxuICAgIEFGUkFNRS5yZWdpc3RlckNvbXBvbmVudChjb21wb25lbnROYW1lICsgJy1kYXRhJywge1xuICAgICAgICBzY2hlbWE6IHtcbiAgICAgICAgICAgIHNhbXBsZWRhdGE6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IFwie31cIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG5cbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IHRoaXMuZWwuZ2V0U2hhcmVkRGF0YSgpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpcy5kYXRhT2JqZWN0KSlcbiAgICAgICAgICAgICAgICB0aGlzLmVsLnNldEF0dHJpYnV0ZShjb21wb25lbnROYW1lICsgXCItZGF0YVwiLCBcInNhbXBsZWRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgZGF0YSBvYmplY3Q6IFwiLCBlLCB0aGlzLmRhdGFPYmplY3QpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHVwZGF0ZSgpIHtcbiAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2FtcGxlZGF0YSk7XG4gICAgICAgICAgICBpZiAodGhpcy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5kYXRhLnNhbXBsZWRhdGEpKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGRvIHRoZXNlIGFmdGVyIHRoZSBKU09OIHBhcnNlIHRvIG1ha2Ugc3VyZSBpdCBoYXMgc3VjY2VlZGVkXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IHRoaXMuZGF0YS5zYW1wbGVkYXRhO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBkYXRhLXN5bmM6IFwiLCBlKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gaXQgaXMgbGlrZWx5IHRoYXQgYXBwbHlQZXJzaXN0ZW50U3luYyBvbmx5IG5lZWRzIHRvIGJlIGNhbGxlZCBmb3IgcGVyc2lzdGVudFxuICAgICAgICAvLyBuZXR3b3JrZWQgZW50aXRpZXMsIHNvIHdlIF9wcm9iYWJseV8gZG9uJ3QgbmVlZCB0byBkbyB0aGlzLiAgQnV0IGlmIHRoZXJlIGlzIG5vXG4gICAgICAgIC8vIHBlcnNpc3RlbnQgZGF0YSBzYXZlZCBmcm9tIHRoZSBuZXR3b3JrIGZvciB0aGlzIGVudGl0eSwgdGhpcyBjb21tYW5kIGRvZXMgbm90aGluZy5cbiAgICAgICAgcGxheSgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgLy8gbm90IHN1cmUgaWYgdGhpcyBpcyByZWFsbHkgbmVlZGVkLCBidXQgY2FuJ3QgaHVydFxuICAgICAgICAgICAgICAgIGlmIChBUFAudXRpbHMpIHsgLy8gdGVtcG9yYXJ5IHRpbGwgd2Ugc2hpcCBuZXcgY2xpZW50XG4gICAgICAgICAgICAgICAgICAgIEFQUC51dGlscy5hcHBseVBlcnNpc3RlbnRTeW5jKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5uZXR3b3JrSWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBzZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAgICAgICAgIGlmICghTkFGLnV0aWxzLmlzTWluZSh0aGlzLmVsKSAmJiAhTkFGLnV0aWxzLnRha2VPd25lcnNoaXAodGhpcy5lbCkpIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgZGF0YVN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBkYXRhU3RyaW5nXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgICAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCIsIFwic2FtcGxlZGF0YVwiLCBkYXRhU3RyaW5nKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjYW4ndCBzdHJpbmdpZnkgdGhlIG9iamVjdCBwYXNzZWQgdG8gZGF0YS1zeW5jXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBvdXIgdGVtcGxhdGUgZm9yIG91ciBuZXR3b3JrZWQgb2JqZWN0IHRvIHRoZSBhLWZyYW1lIGFzc2V0cyBvYmplY3QsXG4gICAgLy8gYW5kIGEgc2NoZW1hIHRvIHRoZSBOQUYuc2NoZW1hcy4gIEJvdGggbXVzdCBiZSB0aGVyZSB0byBoYXZlIGN1c3RvbSBjb21wb25lbnRzIHdvcmtcblxuICAgIGNvbnN0IGFzc2V0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLWFzc2V0c1wiKTtcblxuICAgIGFzc2V0cy5pbnNlcnRBZGphY2VudEhUTUwoXG4gICAgICAgICdiZWZvcmVlbmQnLFxuICAgICAgICBgXG48dGVtcGxhdGUgaWQ9XCJgICsgY29tcG9uZW50TmFtZSArIGAtZGF0YS1tZWRpYVwiPlxuICA8YS1lbnRpdHlcbiAgICBgICsgY29tcG9uZW50TmFtZSArIGAtZGF0YVxuICA+PC9hLWVudGl0eT5cbjwvdGVtcGxhdGU+XG5gXG4gICAgKVxuXG4gICAgTkFGLnNjaGVtYXMuYWRkKHtcbiAgICAgICAgdGVtcGxhdGU6IFwiI1wiICsgY29tcG9uZW50TmFtZSArIFwiLWRhdGEtbWVkaWFcIixcbiAgICAgICAgY29tcG9uZW50czogW3tcbiAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNhbXBsZWRhdGFcIlxuICAgICAgICB9XSxcbiAgICAgICAgbm9uQXV0aG9yaXplZENvbXBvbmVudHM6IFt7XG4gICAgICAgICAgICBjb21wb25lbnQ6IGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCIsXG4gICAgICAgICAgICBwcm9wZXJ0eTogXCJzYW1wbGVkYXRhXCJcbiAgICAgICAgfV0sXG5cbiAgICB9KTtcbn0iLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogY3JlYXRlIGEgdGhyZWVqcyBvYmplY3QgKHR3byBjdWJlcywgb25lIG9uIHRoZSBzdXJmYWNlIG9mIHRoZSBvdGhlcikgdGhhdCBjYW4gYmUgaW50ZXJhY3RlZCBcbiAqIHdpdGggYW5kIGhhcyBzb21lIG5ldHdvcmtlZCBhdHRyaWJ1dGVzLlxuICpcbiAqL1xuaW1wb3J0IHtcbiAgICBpbnRlcmFjdGl2ZUNvbXBvbmVudFRlbXBsYXRlLFxuICAgIHJlZ2lzdGVyU2hhcmVkQUZSQU1FQ29tcG9uZW50c1xufSBmcm9tIFwiLi4vdXRpbHMvaW50ZXJhY3Rpb25cIjtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gc2ltcGxlIGNvbnZlbmllbmNlIGZ1bmN0aW9ucyBcbmZ1bmN0aW9uIHJhbmRvbUNvbG9yKCkge1xuICAgIHJldHVybiBuZXcgVEhSRUUuQ29sb3IoTWF0aC5yYW5kb20oKSwgTWF0aC5yYW5kb20oKSwgTWF0aC5yYW5kb20oKSk7XG59XG5cbmZ1bmN0aW9uIGFsbW9zdEVxdWFsVmVjMyh1LCB2LCBlcHNpbG9uKSB7XG4gICAgcmV0dXJuIE1hdGguYWJzKHUueCAtIHYueCkgPCBlcHNpbG9uICYmIE1hdGguYWJzKHUueSAtIHYueSkgPCBlcHNpbG9uICYmIE1hdGguYWJzKHUueiAtIHYueikgPCBlcHNpbG9uO1xufTtcblxuZnVuY3Rpb24gYWxtb3N0RXF1YWxDb2xvcih1LCB2LCBlcHNpbG9uKSB7XG4gICAgcmV0dXJuIE1hdGguYWJzKHUuciAtIHYucikgPCBlcHNpbG9uICYmIE1hdGguYWJzKHUuZyAtIHYuZykgPCBlcHNpbG9uICYmIE1hdGguYWJzKHUuYiAtIHYuYikgPCBlcHNpbG9uO1xufTtcblxuLy8gYSBsb3Qgb2YgdGhlIGNvbXBsZXhpdHkgaGFzIGJlZW4gcHVsbGVkIG91dCBpbnRvIG1ldGhvZHMgaW4gdGhlIG9iamVjdFxuLy8gY3JlYXRlZCBieSBpbnRlcmFjdGl2ZUNvbXBvbmVudFRlbXBsYXRlKCkgYW5kIHJlZ2lzdGVyU2hhcmVkQUZSQU1FY29tcG9uZW50cygpLlxuLy8gSGVyZSwgd2UgZGVmaW5lIG1ldGhvZHMgdGhhdCBhcmUgdXNlZCBieSB0aGUgb2JqZWN0IHRoZXJlLCB0byBkbyBvdXIgb2JqZWN0LXNwZWNpZmljXG4vLyB3b3JrLlxuXG4vLyBXZSBuZWVkIHRvIGRlZmluZTpcbi8vIC0gQUZSQU1FIFxuLy8gICAtIHNjaGVtYVxuLy8gICAtIGluaXQoKSBtZXRob2QsIHdoaWNoIHNob3VsZCBjYW4gc3RhcnRJbml0KCkgYW5kIGZpbmlzaEluaXQoKVxuLy8gICAtIHVwZGF0ZSgpIGFuZCBwbGF5KCkgaWYgeW91IG5lZWQgdGhlbVxuLy8gICAtIHRpY2soKSBhbmQgdGljazIoKSB0byBoYW5kbGUgZnJhbWUgdXBkYXRlc1xuLy9cbi8vIC0gY2hhbmdlIGlzTmV0d29ya2VkLCBpc0ludGVyYWN0aXZlLCBpc0RyYWdnYWJsZSAoZGVmYXVsdDogZmFsc2UpIHRvIHJlZmxlY3Qgd2hhdCBcbi8vICAgdGhlIG9iamVjdCBuZWVkcyB0byBkby5cbi8vIC0gbG9hZERhdGEoKSBpcyBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IGRvZXMgYW55IHNsb3cgd29yayAobG9hZGluZyB0aGluZ3MsIGV0Yylcbi8vICAgYW5kIGlzIGNhbGxlZCBieSBmaW5pc2hJbml0KCksIHdoaWNoIHdhaXRzIHRpbGwgaXQncyBkb25lIGJlZm9yZSBzZXR0aW5nIHRoaW5ncyB1cFxuLy8gLSBpbml0aWFsaXplRGF0YSgpIGlzIGNhbGxlZCB0byBzZXQgdXAgdGhlIGluaXRpYWwgc3RhdGUgb2YgdGhlIG9iamVjdCwgYSBnb29kIFxuLy8gICBwbGFjZSB0byBjcmVhdGUgdGhlIDNEIGNvbnRlbnQuICBUaGUgdGhyZWUuanMgc2NlbmUgc2hvdWxkIGJlIGFkZGVkIHRvIFxuLy8gICB0aGlzLnNpbXBsZUNvbnRhaW50ZXJcbi8vIC0gY2xpY2tlZCgpIGlzIGNhbGxlZCB3aGVuIHRoZSBvYmplY3QgaXMgY2xpY2tlZFxuLy8gLSBkcmFnU3RhcnQoKSBpcyBjYWxsZWQgcmlnaHQgYWZ0ZXIgY2xpY2tlZCgpIGlmIGlzRHJhZ2dhYmxlIGlzIHRydWUsIHRvIHNldCB1cFxuLy8gICBmb3IgYSBwb3NzaWJsZSBkcmFnIG9wZXJhdGlvblxuLy8gLSBkcmFnRW5kKCkgaXMgY2FsbGVkIHdoZW4gdGhlIG1vdXNlIGlzIHJlbGVhc2VkXG4vLyAtIGRyYWcoKSBzaG91bGQgYmUgY2FsbGVkIGVhY2ggZnJhbWUgd2hpbGUgdGhlIG9iamVjdCBpcyBiZWluZyBkcmFnZ2VkIChiZXR3ZWVuIFxuLy8gICBkcmFnU3RhcnQoKSBhbmQgZHJhZ0VuZCgpKVxuLy8gLSBnZXRJbnRlcmFjdG9ycygpIHJldHVybnMgYW4gYXJyYXkgb2Ygb2JqZWN0cyBmb3Igd2hpY2ggaW50ZXJhY3Rpb24gY29udHJvbHMgYXJlXG4vLyAgIGludGVyc2VjdGluZyB0aGUgb2JqZWN0LiBUaGVyZSB3aWxsIGxpa2VseSBiZSB6ZXJvLCBvbmUsIG9yIHR3byBvZiB0aGVzZSAoaWYgXG4vLyAgIHRoZXJlIGFyZSB0d28gY29udHJvbGxlcnMgYW5kIGJvdGggYXJlIHBvaW50aW5nIGF0IHRoZSBvYmplY3QpLiAgVGhlIFwiY3Vyc29yXCJcbi8vICAgZmllbGQgaXMgYSBwb2ludGVyIHRvIHRoZSBzbWFsbCBzcGhlcmUgT2JqZWN0M0QgdGhhdCBpcyBkaXNwbGF5ZWQgd2hlcmUgdGhlIFxuLy8gICBpbnRlcmFjdGlvbiByYXkgdG91Y2hlcyB0aGUgb2JqZWN0LiBUaGUgXCJjb250cm9sbGVyXCIgZmllbGQgaXMgdGhlIFxuLy8vICBjb3JyZXNwb25kaW5nIGNvbnRyb2xsZXJcbi8vICAgb2JqZWN0IHRoYXQgaW5jbHVkZXMgdGhpbmdzIGxpa2UgdGhlIHJheUNhc3Rlci5cbi8vIC0gZ2V0SW50ZXJzZWN0aW9uKCkgdGFrZXMgaW4gdGhlIGludGVyYWN0b3IgYW5kIHRoZSB0aHJlZS5qcyBvYmplY3QzRCBhcnJheSBcbi8vICAgdGhhdCBzaG91bGQgYmUgdGVzdGVkIGZvciBpbnRlcmFjdGlvbi5cblxuLy8gTm90ZSB0aGF0IG9ubHkgdGhlIGVudGl0eSB0aGF0IHRoaXMgY29tcG9uZW50IGlzIGF0dGFjaGVkIHRvIHdpbGwgYmUgXCJzZWVuXCJcbi8vIGJ5IEh1YnMgaW50ZXJhY3Rpb24gc3lzdGVtLCBzbyB0aGUgZW50aXJlIHRocmVlLmpzIHRyZWUgYmVsb3cgaXQgdHJpZ2dlcnNcbi8vIGNsaWNrIGFuZCBkcmFnIGV2ZW50cy4gIFRoZSBnZXRJbnRlcnNlY3Rpb24oKSBtZXRob2QgaXMgbmVlZGVkIFxuXG4vLyB0aGUgY29tcG9uZW50TmFtZSBtdXN0IGJlIGxvd2VyY2FzZSwgY2FuIGhhdmUgaHlwaGVucywgc3RhcnQgd2l0aCBhIGxldHRlciwgXG4vLyBidXQgbm8gdW5kZXJzY29yZXNcbmxldCBjb21wb25lbnROYW1lID0gXCJ0ZXN0LWN1YmVcIjtcblxuLy8gZ2V0IHRoZSB0ZW1wbGF0ZSBwYXJ0IG9mIHRoZSBvYmplY3QgbmVlZCBmb3IgdGhlIEFGUkFNRSBjb21wb25lbnRcbmxldCB0ZW1wbGF0ZSA9IGludGVyYWN0aXZlQ29tcG9uZW50VGVtcGxhdGUoY29tcG9uZW50TmFtZSk7XG5cbi8vIGNyZWF0ZSB0aGUgYWRkaXRpb25hbCBwYXJ0cyBvZiB0aGUgb2JqZWN0IG5lZWRlZCBmb3IgdGhlIEFGUkFNRSBjb21wb25lbnRcbmxldCBjaGlsZCA9IHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBpcyBob3BlZnVsbHkgdW5pcXVlIGZvciBlYWNoIGluc3RhbmNlXG4gICAgICAgIG5hbWU6IHtcbiAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiBcIlwiXG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gdGhlIHRlbXBsYXRlIHdpbGwgbG9vayBmb3IgdGhlc2UgcHJvcGVydGllcy4gSWYgdGhleSBhcmVuJ3QgdGhlcmUsIHRoZW5cbiAgICAgICAgLy8gdGhlIGxvb2t1cCAodGhpcy5kYXRhLiopIHdpbGwgZXZhbHVhdGUgdG8gZmFsc2V5XG4gICAgICAgIGlzTmV0d29ya2VkOiB7XG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIGlzSW50ZXJhY3RpdmU6IHtcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBpc0RyYWdnYWJsZToge1xuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gb3VyIGRhdGFcbiAgICAgICAgd2lkdGg6IHtcbiAgICAgICAgICAgIHR5cGU6IFwibnVtYmVyXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiAxXG4gICAgICAgIH0sXG4gICAgICAgIGNvbG9yOiB7XG4gICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgZGVmYXVsdDogXCJcIlxuICAgICAgICB9LFxuICAgICAgICBwYXJhbWV0ZXIxOiB7XG4gICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgZGVmYXVsdDogXCJcIlxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIGZ1bGxOYW1lIGlzIHVzZWQgdG8gZ2VuZXJhdGUgbmFtZXMgZm9yIHRoZSBBRlJhbWUgb2JqZWN0cyB3ZSBjcmVhdGUuICBTaG91bGQgYmVcbiAgICAvLyB1bmlxdWUgZm9yIGVhY2ggaW5zdGFuY2Ugb2YgYW4gb2JqZWN0LCB3aGljaCB3ZSBzcGVjaWZ5IHdpdGggbmFtZS4gIElmIG5hbWUgZG9lc1xuICAgIC8vIG5hbWUgZ2V0IHVzZWQgYXMgYSBzY2hlbWUgcGFyYW1ldGVyLCBpdCBkZWZhdWx0cyB0byB0aGUgbmFtZSBvZiBpdCdzIHBhcmVudCBnbFRGXG4gICAgLy8gb2JqZWN0LCB3aGljaCBvbmx5IHdvcmtzIGlmIHRob3NlIGFyZSB1bmlxdWVseSBuYW1lZC5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc3RhcnRJbml0KCk7XG5cbiAgICAgICAgLy8gdGhlIHRlbXBsYXRlIHVzZXMgdGhlc2UgdG8gc2V0IHRoaW5ncyB1cC4gIHJlbGF0aXZlU2l6ZVxuICAgICAgICAvLyBpcyB1c2VkIHRvIHNldCB0aGUgc2l6ZSBvZiB0aGUgb2JqZWN0IHJlbGF0aXZlIHRvIHRoZSBzaXplIG9mIHRoZSBpbWFnZVxuICAgICAgICAvLyB0aGF0IGl0J3MgYXR0YWNoZWQgdG86IGEgc2l6ZSBvZiAxIG1lYW5zIFxuICAgICAgICAvLyAgIFwidGhlIHNpemUgb2YgMXgxeDEgdW5pdHMgaW4gdGhlIG9iamVjdFxuICAgICAgICAvLyAgICBzcGFjZSB3aWxsIGJlIHRoZSBzYW1lIGFzIHRoZSBzaXplIG9mIHRoZSBpbWFnZVwiLiAgXG4gICAgICAgIC8vIExhcmdlciByZWxhdGl2ZSBzaXplcyB3aWxsIG1ha2UgdGhlIG9iamVjdCBzbWFsbGVyIGJlY2F1c2Ugd2UgYXJlXG4gICAgICAgIC8vIHNheWluZyB0aGF0IGEgc2l6ZSBvZiBOeE54TiBtYXBzIHRvIHRoZSBTaXplIG9mIHRoZSBpbWFnZSwgYW5kIHZpY2UgdmVyc2EuICBcbiAgICAgICAgLy8gRm9yIGV4YW1wbGUsIGlmIHRoZSBvYmplY3QgYmVsb3cgaXMgMiwyIGluIHNpemUgYW5kIHdlIHNldCBzaXplIDIsIHRoZW5cbiAgICAgICAgLy8gdGhlIG9iamVjdCB3aWxsIHJlbWFpbiB0aGUgc2FtZSBzaXplIGFzIHRoZSBpbWFnZS4gSWYgd2UgbGVhdmUgaXQgYXQgMSwxLFxuICAgICAgICAvLyB0aGVuIHRoZSBvYmplY3Qgd2lsbCBiZSB0d2ljZSB0aGUgc2l6ZSBvZiB0aGUgaW1hZ2UuIFxuICAgICAgICB0aGlzLnJlbGF0aXZlU2l6ZSA9IHRoaXMuZGF0YS53aWR0aDtcblxuICAgICAgICAvLyBvdmVycmlkZSB0aGUgZGVmYXVsdHMgaW4gdGhlIHRlbXBsYXRlXG4gICAgICAgIHRoaXMuaXNEcmFnZ2FibGUgPSB0aGlzLmRhdGEuaXNEcmFnZ2FibGU7XG4gICAgICAgIHRoaXMuaXNJbnRlcmFjdGl2ZSA9IHRoaXMuZGF0YS5pc0ludGVyYWN0aXZlO1xuICAgICAgICB0aGlzLmlzTmV0d29ya2VkID0gdGhpcy5kYXRhLmlzTmV0d29ya2VkO1xuXG4gICAgICAgIC8vIG91ciBwb3RlbnRpYWxsLXNoYXJlZCBvYmplY3Qgc3RhdGUgKHR3byByb2F0aW9ucyBhbmQgdHdvIGNvbG9ycyBmb3IgdGhlIGJveGVzKSBcbiAgICAgICAgdGhpcy5zaGFyZWREYXRhID0ge1xuICAgICAgICAgICAgY29sb3I6IG5ldyBUSFJFRS5Db2xvcih0aGlzLmRhdGEuY29sb3IubGVuZ3RoID4gMCA/IHRoaXMuZGF0YS5jb2xvciA6IFwiZ3JleVwiKSxcbiAgICAgICAgICAgIHJvdGF0aW9uOiBuZXcgVEhSRUUuRXVsZXIoKSxcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygwLDAuNSwwKVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIHNvbWUgbG9jYWwgc3RhdGVcbiAgICAgICAgdGhpcy5pbml0aWFsRXVsZXIgPSBuZXcgVEhSRUUuRXVsZXIoKVxuXG4gICAgICAgIC8vIHNvbWUgY2xpY2svZHJhZyBzdGF0ZVxuICAgICAgICB0aGlzLmNsaWNrRXZlbnQgPSBudWxsXG4gICAgICAgIHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24gPSBudWxsXG5cbiAgICAgICAgLy8gd2Ugc2hvdWxkIHNldCBmdWxsTmFtZSBpZiB3ZSBoYXZlIGEgbWVhbmluZ2Z1bCBuYW1lXG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSAmJiB0aGlzLmRhdGEubmFtZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5kYXRhLm5hbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBmaW5pc2ggdGhlIGluaXRpYWxpemF0aW9uXG4gICAgICAgIHRoaXMuZmluaXNoSW5pdCgpO1xuICAgIH0sXG5cbiAgICAvLyBpZiBhbnl0aGluZyBjaGFuZ2VkIGluIHRoaXMuZGF0YSwgd2UgbmVlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4gIFxuICAgIC8vIHRoaXMgaXMgcHJvYmFibHkgbm90IGdvaW5nIHRvIGhhcHBlbiwgYnV0IGNvdWxkIGlmIGFub3RoZXIgb2YgXG4gICAgLy8gb3VyIHNjcmlwdHMgbW9kaWZpZXMgdGhlIGNvbXBvbmVudCBwcm9wZXJ0aWVzIGluIHRoZSBET01cbiAgICB1cGRhdGU6IGZ1bmN0aW9uICgpIHt9LFxuXG4gICAgLy8gZG8gc29tZSBzdHVmZiB0byBnZXQgYXN5bmMgZGF0YS4gIENhbGxlZCBieSBpbml0VGVtcGxhdGUoKVxuICAgIGxvYWREYXRhOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVyblxuICAgIH0sXG5cbiAgICAvLyBjYWxsZWQgYnkgaW5pdFRlbXBsYXRlKCkgd2hlbiB0aGUgY29tcG9uZW50IGlzIGJlaW5nIHByb2Nlc3NlZC4gIEhlcmUsIHdlIGNyZWF0ZVxuICAgIC8vIHRoZSB0aHJlZS5qcyBvYmplY3RzIHdlIHdhbnQsIGFuZCBhZGQgdGhlbSB0byBzaW1wbGVDb250YWluZXIgKGFuIEFGcmFtZSBub2RlIFxuICAgIC8vIHRoZSB0ZW1wbGF0ZSBjcmVhdGVkIGZvciB1cykuXG4gICAgaW5pdGlhbGl6ZURhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5ib3ggPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAxLCAxLCAyLCAyLCAyKSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgICAgICAgICAgICAgY29sb3I6IHRoaXMuc2hhcmVkRGF0YS5jb2xvclxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5ib3gubWF0cml4QXV0b1VwZGF0ZSA9IHRydWU7XG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldE9iamVjdDNEKCdib3gnLCB0aGlzLmJveClcblxuICAgICAgICAvLyBjcmVhdGUgYSBzZWNvbmQgc21hbGwsIGJsYWNrIGJveCBvbiB0aGUgc3VyZmFjZSBvZiB0aGUgYm94XG4gICAgICAgIHRoaXMuYm94MiA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDAuMSwgMC4xLCAwLjEsIDIsIDIsIDIpLFxuICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgICAgICAgICBjb2xvcjogXCJibGFja1wiXG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmJveDIubWF0cml4QXV0b1VwZGF0ZSA9IHRydWU7XG4gICAgICAgIHRoaXMuYm94Mi5wb3NpdGlvbi5jb3B5KHRoaXMuc2hhcmVkRGF0YS5wb3NpdGlvbilcblxuICAgICAgICAvLyBhZGQgaXQgYXMgYSBjaGlsZCBvZiB0aGUgZmlyc3QgYm94LCBzaW5jZSB3ZSB3YW50IGl0IHRvIG1vdmUgd2l0aCB0aGUgZmlyc3QgYm94XG4gICAgICAgIHRoaXMuYm94LmFkZCh0aGlzLmJveDIpXG5cbiAgICAgICAgLy8gSU1QT1JUQU5UOiBhbnkgdGhyZWUuanMgb2JqZWN0IHRoYXQgaXMgYWRkZWQgdG8gYSBIdWJzIChhZnJhbWUpIGVudGl0eSBcbiAgICAgICAgLy8gbXVzdCBoYXZlIFwiLmVsXCIgcG9pbnRpbmcgdG8gdGhlIEFGUkFNRSBFbnRpdHkgdGhhdCBjb250YWlucyBpdC5cbiAgICAgICAgLy8gV2hlbiBhbiBvYmplY3QzRCBpcyBhZGRlZCB3aXRoIFwiLnNldE9iamVjdDNEXCIsIGl0IGlzIGFkZGVkIHRvIHRoZSBcbiAgICAgICAgLy8gb2JqZWN0M0QgZm9yIHRoYXQgRW50aXR5LCBhbmQgc2V0cyBhbGwgb2YgdGhlIGNoaWxkcmVuIG9mIHRoYXRcbiAgICAgICAgLy8gb2JqZWN0M0QgdG8gcG9pbnQgdG8gdGhlIHNhbWUgRW50aXR5LiAgSWYgeW91IGFkZCBhbiBvYmplY3QzRCB0b1xuICAgICAgICAvLyB0aGUgc3ViLXRyZWUgb2YgdGhhdCBvYmplY3QgbGF0ZXIsIHlvdSBtdXN0IGRvIHRoaXMgeW91cnNlbGYuIFxuICAgICAgICB0aGlzLmJveDIuZWwgPSB0aGlzLnNpbXBsZUNvbnRhaW5lclxuXG4gICAgICAgIC8vIHRlbGwgdGhlIHBvcnRhbHMgdG8gdXBkYXRlIHRoZWlyIHZpZXdcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmVtaXQoJ3VwZGF0ZVBvcnRhbHMnKSBcblxuICAgIH0sXG5cbiAgICAvLyBjYWxsZWQgZnJvbSByZW1vdmUoKSBpbiB0aGUgdGVtcGxhdGUgdG8gcmVtb3ZlIGFueSBsb2NhbCByZXNvdXJjZXMgd2hlbiB0aGUgY29tcG9uZW50XG4gICAgLy8gaXMgZGVzdHJveWVkXG4gICAgcmVtb3ZlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnJlbW92ZU9iamVjdDNEKFwiYm94XCIpXG4gICAgICAgIHRoaXMuYm94Lmdlb21ldHJ5LmRpc3Bvc2UoKVxuICAgICAgICB0aGlzLmJveC5tYXRlcmlhbC5kaXNwb3NlKClcbiAgICAgICAgdGhpcy5ib3gyLmdlb21ldHJ5LmRpc3Bvc2UoKVxuICAgICAgICB0aGlzLmJveDIubWF0ZXJpYWwuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMucmVtb3ZlVGVtcGxhdGUoKVxuICAgIH0sXG5cbiAgICAvLyBoYW5kbGUgXCJpbnRlcmFjdFwiIGV2ZW50cyBmb3IgY2xpY2thYmxlIGVudGl0aWVzXG4gICAgY2xpY2tlZDogZnVuY3Rpb24gKGV2dCkge1xuICAgICAgICAvLyB0aGUgZXZ0LnRhcmdldCB3aWxsIHBvaW50IGF0IHRoZSBvYmplY3QzRCBpbiB0aGlzIGVudGl0eS4gIFdlIGNhbiB1c2VcbiAgICAgICAgLy8gaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJhY3Rpb25UYXJnZXQoKSB0byBnZXQgdGhlIG1vcmUgcHJlY2lzZSBcbiAgICAgICAgLy8gaGl0IGluZm9ybWF0aW9uIGFib3V0IHdoaWNoIG9iamVjdDNEcyBpbiBvdXIgb2JqZWN0IHdlcmUgaGl0LiAgV2Ugc3RvcmVcbiAgICAgICAgLy8gdGhlIG9uZSB0aGF0IHdhcyBjbGlja2VkIGhlcmUsIHNvIHdlIGtub3cgd2hpY2ggaXQgd2FzIGFzIHdlIGRyYWcgYXJvdW5kXG4gICAgICAgIHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24gPSB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmdldEludGVyc2VjdGlvbihldnQub2JqZWN0M0QsIFtldnQudGFyZ2V0XSk7XG4gICAgICAgIHRoaXMuY2xpY2tFdmVudCA9IGV2dDtcblxuICAgICAgICBpZiAoIXRoaXMuY2xpY2tJbnRlcnNlY3Rpb24pIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcImNsaWNrIGRpZG4ndCBoaXQgYW55dGhpbmc7IHNob3VsZG4ndCBoYXBwZW5cIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gpIHtcbiAgICAgICAgICAgIC8vIG5ldyByYW5kb20gY29sb3Igb24gZWFjaCBjbGlja1xuICAgICAgICAgICAgbGV0IG5ld0NvbG9yID0gcmFuZG9tQ29sb3IoKVxuXG4gICAgICAgICAgICB0aGlzLmJveC5tYXRlcmlhbC5jb2xvci5zZXQobmV3Q29sb3IpXG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEuY29sb3Iuc2V0KG5ld0NvbG9yKVxuICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhKClcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHt9XG4gICAgfSxcblxuICAgIC8vIGNhbGxlZCB0byBzdGFydCB0aGUgZHJhZy4gIFdpbGwgYmUgY2FsbGVkIGFmdGVyIGNsaWNrZWQoKSBpZiBpc0RyYWdnYWJsZSBpcyB0cnVlXG4gICAgZHJhZ1N0YXJ0OiBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgIC8vIHNldCB1cCB0aGUgZHJhZyBzdGF0ZVxuICAgICAgICBpZiAoIXRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uc3RhcnREcmFnKGV2dCkpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gZ3JhYiBhIGNvcHkgb2YgdGhlIGN1cnJlbnQgb3JpZW50YXRpb24gb2YgdGhlIG9iamVjdCB3ZSBjbGlja2VkXG4gICAgICAgIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveCkge1xuICAgICAgICAgICAgdGhpcy5pbml0aWFsRXVsZXIuY29weSh0aGlzLmJveC5yb3RhdGlvbilcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHtcbiAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJyZWRcIilcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBjYWxsZWQgd2hlbiB0aGUgYnV0dG9uIGlzIHJlbGVhc2VkIHRvIGZpbmlzaCB0aGUgZHJhZ1xuICAgIGRyYWdFbmQ6IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5lbmREcmFnKGV2dClcbiAgICAgICAgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94KSB7fSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHtcbiAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJibGFja1wiKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIHRoZSBtZXRob2Qgc2V0U2hhcmVkRGF0YSgpIGFsd2F5cyBzZXRzIHRoZSBzaGFyZWQgZGF0YSwgY2F1c2luZyBhIG5ldHdvcmsgdXBkYXRlLiAgXG4gICAgLy8gV2UgY2FuIGJlIHNtYXJ0ZXIgaGVyZSBieSBjYWxsaW5nIGl0IG9ubHkgd2hlbiBzaWduaWZpY2FudCBjaGFuZ2VzIGhhcHBlbiwgXG4gICAgLy8gd2hpY2ggd2UnbGwgZG8gaW4gdGhlIHNldFNoYXJlZEV1bGVyIG1ldGhvZHNcbiAgICBzZXRTaGFyZWRFdWxlcjogZnVuY3Rpb24gKG5ld0V1bGVyKSB7XG4gICAgICAgIGlmICghYWxtb3N0RXF1YWxWZWMzKHRoaXMuc2hhcmVkRGF0YS5yb3RhdGlvbiwgbmV3RXVsZXIsIDAuMDUpKSB7XG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEucm90YXRpb24uY29weShuZXdFdWxlcilcbiAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNldFNoYXJlZFBvc2l0aW9uOiBmdW5jdGlvbiAobmV3UG9zKSB7XG4gICAgICAgIGlmICghYWxtb3N0RXF1YWxWZWMzKHRoaXMuc2hhcmVkRGF0YS5wb3NpdGlvbiwgbmV3UG9zLCAwLjA1KSkge1xuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLnBvc2l0aW9uLmNvcHkobmV3UG9zKVxuICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBpZiB0aGUgb2JqZWN0IGlzIG5ldHdvcmtlZCwgdGhpcy5zdGF0ZVN5bmMgd2lsbCBleGlzdCBhbmQgc2hvdWxkIGJlIGNhbGxlZFxuICAgIHNldFNoYXJlZERhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMuc2V0U2hhcmVkRGF0YSh0aGlzLnNoYXJlZERhdGEpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9LFxuXG4gICAgLy8gdGhpcyBpcyBjYWxsZWQgZnJvbSB0aGUgbmV0d29ya2VkIGRhdGEgZW50aXR5IHRvIGdldCB0aGUgaW5pdGlhbCBkYXRhIFxuICAgIC8vIGZyb20gdGhlIGNvbXBvbmVudFxuICAgIGdldFNoYXJlZERhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2hhcmVkRGF0YVxuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICBpZiAoIXRoaXMuYm94KSB7XG4gICAgICAgICAgICAvLyBoYXZlbid0IGZpbmlzaGVkIGluaXRpYWxpemluZyB5ZXRcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGl0J3MgaW50ZXJhY3RpdmUsIHdlJ2xsIGhhbmRsZSBkcmFnIGFuZCBob3ZlciBldmVudHNcbiAgICAgICAgaWYgKHRoaXMuaXNJbnRlcmFjdGl2ZSkge1xuXG4gICAgICAgICAgICAvLyBpZiB3ZSdyZSBkcmFnZ2luZywgdXBkYXRlIHRoZSByb3RhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2FibGUgJiYgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5pc0RyYWdnaW5nKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBkbyBzb21ldGhpbmcgd2l0aCB0aGUgZHJhZ2dpbmcuIEhlcmUsIHdlJ2xsIHVzZSBkZWx0YS54IGFuZCBkZWx0YS55XG4gICAgICAgICAgICAgICAgLy8gdG8gcm90YXRlIHRoZSBvYmplY3QuICBUaGVzZSB2YWx1ZXMgYXJlIHNldCBhcyBhIHJlbGF0aXZlIG9mZnNldCBpblxuICAgICAgICAgICAgICAgIC8vIHRoZSBwbGFuZSBwZXJwZW5kaWN1bGFyIHRvIHRoZSB2aWV3LCBzbyB3ZSdsbCB1c2UgdGhlbSB0byBvZmZzZXQgdGhlXG4gICAgICAgICAgICAgICAgLy8geCBhbmQgeSByb3RhdGlvbiBvZiB0aGUgb2JqZWN0LiAgVGhpcyBpcyBhIFRFUlJJQkxFIHdheSB0byBkbyByb3RhdGUsXG4gICAgICAgICAgICAgICAgLy8gYnV0IGl0J3MgYSBzaW1wbGUgZXhhbXBsZS5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIGRyYWcgc3RhdGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5kcmFnKClcblxuICAgICAgICAgICAgICAgICAgICAvLyBjb21wdXRlIGEgbmV3IHJvdGF0aW9uIGJhc2VkIG9uIHRoZSBkZWx0YVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJveC5yb3RhdGlvbi5zZXQodGhpcy5pbml0aWFsRXVsZXIueCAtIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZGVsdGEueCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5pdGlhbEV1bGVyLnkgKyB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmRlbHRhLnksXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxFdWxlci56KVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSB0aGUgc2hhcmVkIHJvdGF0aW9uXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRXVsZXIodGhpcy5ib3gucm90YXRpb24pXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyB3ZSB3YW50IHRvIGhpdCB0ZXN0IG9uIG91ciBib3hlcywgYnV0IG9ubHkgd2FudCB0byBrbm93IGlmL3doZXJlXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGhpdCB0aGUgYmlnIGJveC4gIFNvIGZpcnN0IGhpZGUgdGhlIHNtYWxsIGJveCwgYW5kIHRoZW4gZG8gYVxuICAgICAgICAgICAgICAgICAgICAvLyBhIGhpdCB0ZXN0LCB3aGljaCBjYW4gb25seSByZXN1bHQgaW4gYSBoaXQgb24gdGhlIGJpZyBib3guICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLnZpc2libGUgPSBmYWxzZVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW50ZXJzZWN0ID0gdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcnNlY3Rpb24odGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5kcmFnSW50ZXJhY3RvciwgW3RoaXMuYm94XSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLnZpc2libGUgPSB0cnVlXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgaGl0IHRoZSBiaWcgYm94LCBtb3ZlIHRoZSBzbWFsbCBib3ggdG8gdGhlIHBvc2l0aW9uIG9mIHRoZSBoaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGludGVyc2VjdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGludGVyc2VjdCBvYmplY3QgaXMgYSBUSFJFRS5JbnRlcnNlY3Rpb24gb2JqZWN0LCB3aGljaCBoYXMgdGhlIGhpdCBwb2ludFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3BlY2lmaWVkIGluIHdvcmxkIGNvb3JkaW5hdGVzLiAgU28gd2UgbW92ZSB0aG9zZSBjb29yZGluYXRlcyBpbnRvIHRoZSBsb2NhbFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29vcmRpYXRlcyBvZiB0aGUgYmlnIGJveCwgYW5kIHRoZW4gc2V0IHRoZSBwb3NpdGlvbiBvZiB0aGUgc21hbGwgYm94IHRvIHRoYXRcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwb3NpdGlvbiA9IHRoaXMuYm94LndvcmxkVG9Mb2NhbChpbnRlcnNlY3QucG9pbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmJveDIucG9zaXRpb24uY29weShwb3NpdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkUG9zaXRpb24odGhpcy5ib3gyLnBvc2l0aW9uKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyBzb21ldGhpbmcgd2l0aCB0aGUgcmF5cyB3aGVuIG5vdCBkcmFnZ2luZyBvciBjbGlja2luZy5cbiAgICAgICAgICAgICAgICAvLyBGb3IgZXhhbXBsZSwgd2UgY291bGQgZGlzcGxheSBzb21lIGFkZGl0aW9uYWwgY29udGVudCB3aGVuIGhvdmVyaW5nXG4gICAgICAgICAgICAgICAgbGV0IHBhc3N0aHJ1SW50ZXJhY3RvciA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJhY3RvcnModGhpcy5zaW1wbGVDb250YWluZXIpO1xuXG4gICAgICAgICAgICAgICAgLy8gd2Ugd2lsbCBzZXQgeWVsbG93IGlmIGVpdGhlciBpbnRlcmFjdG9yIGhpdHMgdGhlIGJveC4gV2UnbGwga2VlcCB0cmFjayBvZiBpZlxuICAgICAgICAgICAgICAgIC8vIG9uZSBkb2VzXG4gICAgICAgICAgICAgICAgbGV0IHNldEl0ID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAvLyBmb3IgZWFjaCBvZiBvdXIgaW50ZXJhY3RvcnMsIGNoZWNrIGlmIGl0IGhpdHMgdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXNzdGhydUludGVyYWN0b3IubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGludGVyc2VjdGlvbiA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJzZWN0aW9uKHBhc3N0aHJ1SW50ZXJhY3RvcltpXSwgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuY2hpbGRyZW4pXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgaGl0IHRoZSBzbWFsbCBib3gsIHNldCB0aGUgY29sb3IgdG8geWVsbG93LCBhbmQgZmxhZyB0aGF0IHdlIGhpdFxuICAgICAgICAgICAgICAgICAgICBpZiAoaW50ZXJzZWN0aW9uICYmIGludGVyc2VjdGlvbi5vYmplY3QgPT09IHRoaXMuYm94Mikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLm1hdGVyaWFsLmNvbG9yLnNldChcInllbGxvd1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0SXQgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBkaWRuJ3QgaGl0LCBtYWtlIHN1cmUgdGhlIGNvbG9yIHJlbWFpbnMgYmxhY2tcbiAgICAgICAgICAgICAgICBpZiAoIXNldEl0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJibGFja1wiKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlbid0IGZpbmlzaGVkIHNldHRpbmcgdXAgdGhlIG5ldHdvcmtlZCBlbnRpdHkgZG9uJ3QgZG8gYW55dGhpbmcuXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgc3RhdGUgaGFzIGNoYW5nZWQgaW4gdGhlIG5ldHdvcmtlZCBkYXRhLCB1cGRhdGUgb3VyIGh0bWwgb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuXG4gICAgICAgICAgICAgICAgLy8gZ290IHRoZSBkYXRhLCBub3cgZG8gc29tZXRoaW5nIHdpdGggaXRcbiAgICAgICAgICAgICAgICBsZXQgbmV3RGF0YSA9IHRoaXMuc3RhdGVTeW5jLmRhdGFPYmplY3RcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEuY29sb3Iuc2V0KG5ld0RhdGEuY29sb3IpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLnJvdGF0aW9uLmNvcHkobmV3RGF0YS5yb3RhdGlvbilcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEucG9zaXRpb24uY29weShuZXdEYXRhLnBvc2l0aW9uKVxuICAgICAgICAgICAgICAgIHRoaXMuYm94Lm1hdGVyaWFsLmNvbG9yLnNldChuZXdEYXRhLmNvbG9yKVxuICAgICAgICAgICAgICAgIHRoaXMuYm94LnJvdGF0aW9uLmNvcHkobmV3RGF0YS5yb3RhdGlvbilcbiAgICAgICAgICAgICAgICB0aGlzLmJveDIucG9zaXRpb24uY29weShuZXdEYXRhLnBvc2l0aW9uKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyByZWdpc3RlciB0aGUgY29tcG9uZW50IHdpdGggdGhlIEFGcmFtZSBzY2VuZVxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KGNvbXBvbmVudE5hbWUsIHtcbiAgICAuLi5jaGlsZCxcbiAgICAuLi50ZW1wbGF0ZVxufSlcblxuLy8gY3JlYXRlIGFuZCByZWdpc3RlciB0aGUgZGF0YSBjb21wb25lbnQgYW5kIGl0J3MgTkFGIGNvbXBvbmVudCB3aXRoIHRoZSBBRnJhbWUgc2NlbmVcbnJlZ2lzdGVyU2hhcmVkQUZSQU1FQ29tcG9uZW50cyhjb21wb25lbnROYW1lKSIsImltcG9ydCAnLi4vc3lzdGVtcy9mYWRlci1wbHVzLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BvcnRhbC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3BhcmFsbGF4LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3NoYWRlci50cydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9odG1sLXNjcmlwdC5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvdmlkZW8tY29udHJvbC1wYWQnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvdGhyZWUtc2FtcGxlLmpzJ1xuXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsICdpbW1lcnNpdmUtMzYwJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCAncG9ydGFsJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdzaGFkZXInLCAnc2hhZGVyJylcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsICdwYXJhbGxheCcpXG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCAnaHRtbC1zY3JpcHQnKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3JlZ2lvbi1oaWRlcicsICdyZWdpb24taGlkZXInKVxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3ZpZGVvLWNvbnRyb2wtcGFkJywgJ3ZpZGVvLWNvbnRyb2wtcGFkJylcblxuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3Rlc3QtY3ViZScsICd0ZXN0LWN1YmUnKVxuXG4vLyBkbyBhIHNpbXBsZSBtb25rZXkgcGF0Y2ggdG8gc2VlIGlmIGl0IHdvcmtzXG5cbi8vIHZhciBteWlzTWluZU9yTG9jYWwgPSBmdW5jdGlvbiAodGhhdCkge1xuLy8gICAgIHJldHVybiAhdGhhdC5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCB8fCAodGhhdC5uZXR3b3JrZWRFbCAmJiBOQUYudXRpbHMuaXNNaW5lKHRoYXQubmV0d29ya2VkRWwpKTtcbi8vICB9XG5cbi8vICB2YXIgdmlkZW9Db21wID0gQUZSQU1FLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXVxuLy8gIHZpZGVvQ29tcC5Db21wb25lbnQucHJvdG90eXBlLmlzTWluZU9yTG9jYWwgPSBteWlzTWluZU9yTG9jYWw7XG5cbi8vIGFkZCB0aGUgcmVnaW9uLWhpZGVyIHRvIHRoZSBzY2VuZVxuLy8gY29uc3Qgc2NlbmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiYS1zY2VuZVwiKTtcbi8vIHNjZW5lLnNldEF0dHJpYnV0ZShcInJlZ2lvbi1oaWRlclwiLCB7c2l6ZTogMTAwfSlcblxubGV0IGhvbWVQYWdlRGVzYyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tjbGFzc149XCJIb21lUGFnZV9fYXBwLWRlc2NyaXB0aW9uXCJdJylcbmlmIChob21lUGFnZURlc2MpIHtcbiAgICBob21lUGFnZURlc2MuaW5uZXJIVE1MID0gXCJSZWFsaXR5IE1lZGlhIEltbWVyc2l2ZSBFeHBlcmllbmNlPGJyPjxicj5BZnRlciBzaWduaW5nIGluLCB2aXNpdCA8YSBocmVmPSdodHRwczovL3JlYWxpdHltZWRpYS5kaWdpdGFsJz5yZWFsaXR5bWVkaWEuZGlnaXRhbDwvYT4gdG8gZ2V0IHN0YXJ0ZWRcIlxufVxuIl0sIm5hbWVzIjpbIndvcmxkQ2FtZXJhIiwid29ybGRTZWxmIiwiZGVmYXVsdEhvb2tzIiwiZ2xzbCIsInVuaWZvcm1zIiwibG9hZGVyIiwibm9pc2VUZXgiLCJzbWFsbE5vaXNlIiwid2FycFRleCIsInNub2lzZSIsIk1hdGVyaWFsTW9kaWZpZXIiLCJvbmNlIiwiaHRtbENvbXBvbmVudHMiLCJwYW5vdmVydCIsInBhbm9mcmFnIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtB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Q3BDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3BELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQ3ZELFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ2xDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ2xDLGNBQWMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsV0FBVyxFQUFFO1FBQzVDLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFO1FBQ3BDLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7UUFDckIsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDN0QsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDNUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLEVBQUU7S0FDL0M7SUFDRCxZQUFZLEVBQUUsRUFBRTtJQUVoQixjQUFjLEVBQUU7UUFDWixRQUFRLEVBQUVBLE1BQUksQ0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O3FCQXdCRDtRQUNiLFNBQVMsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7S0FpSWxCO1FBQ0QsVUFBVSxFQUFFQSxNQUFJLENBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQXFCZjtLQUNBO0lBQ0QsSUFBSSxFQUFFLFVBQVMsUUFBMkM7UUFDdEQsSUFBSSxHQUFHLEdBQUksUUFBMEQsQ0FBQTtRQUVyRSxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFBO1FBQ3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUE7O1FBR3ZELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUE7UUFJckYsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQTtRQUM1SCxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJ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Q0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztTQXNCYjtRQUNELFVBQVUsRUFBRUEsTUFBSSxDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FxRWY7S0FDSjtJQUNELElBQUksRUFBRSxVQUFTLFFBQTJDO1FBQ3RELElBQUksR0FBRyxHQUFJLFFBQTBELENBQUE7UUFFckUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7UUFDNUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7O1FBRTVHLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFBO1FBQ3hFLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFDLEdBQUcsSUFBSSxFQUFFLENBQUE7UUFFdkQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQTs7UUFHekMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUE7UUFDekMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUE7UUFDM0MsUUFBUSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsS0FBSyxFQUFDLENBQUE7UUFDakgsUUFBUSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUE7UUFDdkgsUUFBUSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsT0FBTyxFQUFFLENBQUE7UUFDbEcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEdBQUksRUFBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsR0FBRyxFQUFDLENBQUE7S0FDN0Y7SUFDRCxjQUFjLEVBQUUsVUFBUyxJQUFZLEVBQUUsUUFBMkM7UUFDOUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUE7UUFDOUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUE7UUFFaEYsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQTtRQUN6QyxR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QUFPLElBQUksQ0FBQyxNQUFNLEtBQUssR0FBRztBQUNsQyxLQUFLO0FBQ0wsQ0FBQzs7QUNsMEJELGFBQWU7O0FDQWYsTUFBTVQsTUFBSSxHQUFHLENBQUM7QUFDZDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkEsTUFBTUEsTUFBSSxHQUFHLENBQUM7QUFDZDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQVlBO0FBQ0EsTUFBTSxXQUFXLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQ3ZDLE1BQU0sU0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRTtBQUNy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QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsRUFBRSxDQUFDO0FBQ0g7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0EsTUFBTSxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFFO0FBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBQztBQUMxQztBQUNBLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLEVBQUU7QUFDckMsRUFBRSxNQUFNLEVBQUU7QUFDVixJQUFJLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRTtBQUM5QyxJQUFJLGdCQUFnQixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEs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
