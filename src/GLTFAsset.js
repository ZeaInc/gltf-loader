import { Box3, Color, Vec3Parameter, ColorParameter, TreeItem, Vec3, resourceLoader } from '@zeainc/zea-engine'

// import { GltfView } from './GltfView/gltf_view.js'
// import { GltfState } from './GltfState/gltf_state.js'
// import { ResourceLoader } from './ResourceLoader/resource_loader.js'

import { glTF } from './gltf/gltf.js'
import { getIsGlb, getContainingFolder } from './gltf/utils.js'
import { GlbParser } from './ResourceLoader/glb_parser.js'
import { gltfLoader } from './ResourceLoader/loader.js'
// import { gltfImage, ImageMimeType } from "./gltf/image.js";
// import { gltfTexture, gltfTextureInfo } from './gltf/texture.js';
// import { gltfSampler } from './gltf/sampler.js';
// import { GL } from './Renderer/webgl.js';
// import { iblSampler } from './ibl_sampler.js';

import { AsyncFileReader } from './ResourceLoader/async_file_reader.js'

import { DracoDecoder } from './ResourceLoader/draco.js'
import { KtxDecoder } from './ResourceLoader/ktx.js'

import { loadHDR } from './libs/hdrpng.js'

// export { GltfView, GltfState, ResourceLoader }

/**
 * Base class that represents geometry items with layering, overlaying and cut away features.
 *
 * **Events**
 * * **cutAwayChanged:** Triggered everytime the cutaway variables change(if enabled or not, the vector and the distance).
 * @extends TreeItem
 */
class GLTFAsset extends TreeItem {
  /**
   * Create a base geometry item.
   * @param {string} name - The name of the base geom item.
   */
  constructor(name) {
    super(name)

    this.init()
  }

  /**
   * inits  a resource loader with which glTFs and
   * environments can be loaded for the view
   * @param {Object} [externalDracoLib] optional object of an external Draco library, e.g. from a CDN
   * @param {Object} [externalKtxLib] optional object of an external KTX library, e.g. from a CDN
   * @returns {ResourceLoader} ResourceLoader
   */
  init(externalDracoLib = undefined, externalKtxLib = undefined) {
    this.initKtxLib(externalKtxLib)
    this.initDracoLib(externalDracoLib)
  }

  /**
   * loads a GLTF asset an builds the scene tree ready for rendering.
   * @returns {Promise} a promise that fulfills when the gltf file was loaded
   */
  async load(gltfFile) {
    let isGlb = undefined
    let buffers = undefined
    let json = undefined
    let data = undefined
    let filename = ''
    resourceLoader.incrementWorkload(1)
    if (typeof gltfFile === 'string') {
      isGlb = getIsGlb(gltfFile)
      //  let response = await axios.get(gltfFile, { responseType: isGlb ? "arraybuffer" : "json" });
      let response = await resourceLoader.loadFile(isGlb ? 'binary' : 'json', gltfFile)
      json = response
      data = response
      filename = gltfFile
    } else {
      console.error('Passed invalid type to loadGltf ' + typeof gltfFile)
    }

    if (isGlb) {
      const glbParser = new GlbParser(data)
      const glb = glbParser.extractGlbData()
      json = glb.json
      buffers = glb.buffers
    }

    const gltf = new glTF(filename)
    // gltf.ktxDecoder = this.view.ktxDecoder
    //Make sure draco decoder instance is ready
    gltf.fromJson(json)

    // because the gltf image paths are not relative
    // to the gltf, we have to resolve all image paths before that
    for (const image of gltf.images) {
      image.resolveRelativePath(getContainingFolder(gltf.path))
    }

    await gltfLoader.load(gltf, this, buffers)

    resourceLoader.incrementWorkDone(1)

    return gltf
  }

  /**
   * loadEnvironment asynchroneously, run IBL sampling and create resources for rendering
   * @param {(String | ArrayBuffer | File)} environmentFile the .hdr file either as path or resource
   * @param {Object} [lutFiles] object containing paths or resources for the environment look up textures. Keys are lut_ggx_file, lut_charlie_file and lut_sheen_E_file
   * @returns {Promise} a promise that fulfills when the environment file was loaded
   */
  async loadEnvironment(environmentFile, lutFiles) {
    let image = undefined
    if (typeof environmentFile === 'string') {
      // let response = await axios.get(environmentFile, { responseType: 'arraybuffer' })
      let response = await resourceLoader.loadFile(environmentFile ? 'binary' : 'json', url)

      image = await loadHDR(new Uint8Array(response.data))
    } else if (environmentFile instanceof ArrayBuffer) {
      image = await loadHDR(new Uint8Array(environmentFile))
    } else if (typeof File !== 'undefined' && environmentFile instanceof File) {
      const imageData = await AsyncFileReader.readAsArrayBuffer(environmentFile).catch(() => {
        console.error('Could not load image with FileReader')
      })
      image = await loadHDR(new Uint8Array(imageData))
    } else {
      console.error('Passed invalid type to loadEnvironment ' + typeof gltfFile)
    }
    if (image === undefined) {
      return undefined
    }
    return _loadEnvironmentFromPanorama(image, this.view, lutFiles)
  }

  /**
   * initKtxLib must be called before loading gltf files with ktx2 assets
   * @param {Object} [externalKtxLib] external ktx library (for example from a CDN)
   */
  initKtxLib(externalKtxLib) {
    // this.view.ktxDecoder = new KtxDecoder(this.view.context, externalKtxLib)
  }

  /**
   * initDracoLib must be called before loading gltf files with draco meshes
   * @param {*} [externalDracoLib] external draco library (for example from a CDN)
   */
  async initDracoLib(externalDracoLib) {
    const dracoDecoder = new DracoDecoder(externalDracoLib)
    if (dracoDecoder !== undefined) {
      await dracoDecoder.ready()
    }
  }
}

export { GLTFAsset }
