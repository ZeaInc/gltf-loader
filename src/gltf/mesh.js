import { gltfPrimitive } from './primitive.js'
import { objectsFromJsons } from './utils.js'
import { GltfObject } from './gltf_object.js'

import { GeomItem, MeshProxy, Quat, TreeItem, Vec3, Xfo } from '@zeainc/zea-engine'

class gltfMesh extends GltfObject {
  constructor() {
    super()
    this.primitives = []
    this.name = undefined
    this.weights = []

    // non gltf
    this.weightsAnimated = undefined
  }

  fromJson(jsonMesh) {
    super.fromJson(jsonMesh)

    if (jsonMesh.name !== undefined) {
      this.name = jsonMesh.name
    }

    this.primitives = objectsFromJsons(jsonMesh.primitives, gltfPrimitive)

    if (jsonMesh.weights !== undefined) {
      this.weights = jsonMesh.weights
    }
  }

  getWeightsAnimated() {
    return this.weightsAnimated !== undefined ? this.weightsAnimated : this.weights
  }

  initGl(gltf, parentItem) {
    // super.initGl(gltf, parentItem)
    // console.log(this.name)

    this.primitives.forEach((primitive) => {
      primitive.initGl(gltf, parentItem)
      // const geomItem = new GeomItem(this.name, mesh, material, xfo)
    })
  }
}

export { gltfMesh }
