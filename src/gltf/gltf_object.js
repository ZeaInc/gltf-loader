import { initGlForMembers, fromKeys } from './utils'

// base class for all gltf objects
class GltfObject {
  constructor() {
    this.extensions = undefined
    this.extras = undefined
  }

  fromJson(json) {
    fromKeys(this, json)
  }

  initGl(gltf, asset, buffers) {
    initGlForMembers(this, gltf, asset, buffers)
  }
}

export { GltfObject }
