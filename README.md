
# About the gLTF-Loader

The GLTF loader enables loading of gLTF, gLTF Binary, and gLTF Drako files into Zea Engine.

Note: the GLTF Loader plugin does not support all the various advanced material configurations available in GLTF. 
Features such as sheen, clear-coat are not currently supported, as these would first need to be supported by the engine.


## Getting Started

Our recommended way to clone this template is by using [degit](https://github.com/Rich-Harris/degit), a project scaffolding tool.

1. In your HTML page, after the engine script tag, add the script tags to load the Draco decoder (only required for Draco support), and the gltf-loader plugin.

```html
  <script src="https://cdn.jsdelivr.net/npm/@zeainc/zea-engine/dist/index.umd.min.js"></script>

  <script src="https://www.gstatic.com/draco/v1/decoders/draco_decoder_gltf.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@zeainc/gltf-loader/dist/index.umd.js"></script>
```

2. After creating the scene and renderer, you can create GLTF assets and load gltf files.

```javascript
  const asset = new GLTFAsset('gltf')
  asset.loadGltf('url/to/file.gtlf').then(() => {
    console.log('Loading done')
    renderer.frameAll()
  })
  scene.getRoot().addChild(asset)
```


## Building and testing the Plugin

  clone the github repository for this project and run the following
```bash
  yarn install
```
  To test out the plugin, run the following.
```bash
  yarn dev
```

## Live demos

* [glTF-Draco/Avocado](http://docs.zea.live/gltf-loader//gltf-asset-test.html?gltf=https://github.khronos.org/glTF-Sample-Viewer-Release/assets/models/2.0/Avocado/glTF-Draco/Avocado.gltf)
* [glTF-Draco/Buggy](http://docs.zea.live/gltf-loader//gltf-asset-test.html?gltf=https://github.khronos.org/glTF-Sample-Viewer-Release/assets/models/2.0/Buggy/glTF-Draco/Buggy.gltf)
* [glTF/DamagedHelmet](http://docs.zea.live/gltf-loader//gltf-asset-test.html?gltf=https://github.khronos.org/glTF-Sample-Viewer-Release/assets/models/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf)
* [glTF/GearboxAssy](http://docs.zea.live/gltf-loader//gltf-asset-test.html?gltf=https://github.khronos.org/glTF-Sample-Viewer-Release/assets/models/2.0/GearboxAssy/glTF/GearboxAssy.gltf)
* [glTF/2CylinderEngine](http://docs.zea.live/gltf-loader//gltf-asset-test.html?gltf=https://github.khronos.org/glTF-Sample-Viewer-Release/assets/models/2.0/2CylinderEngine/glTF/2CylinderEngine.gltf)
    
## Credits
Khronos® and Vulkan® are registered trademarks, glTF™ is a trademarks of The Khronos Group Inc.
