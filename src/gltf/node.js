// import { mat4, quat } from 'gl-matrix'
// import { jsToGl } from './utils.js';
import {
  BooleanParameter,
  StringParameter,
  NumberParameter,
  GeomItem,
  Mat4,
  MeshProxy,
  Quat,
  TreeItem,
  Vec3,
  Xfo,
} from '@zeainc/zea-engine'
import { GltfObject } from './gltf_object.js'

const jsToGl = (values) => {
  return values
}

// contain:
// transform
// child indices (reference to scene array of nodes)

class gltfNode extends GltfObject {
  constructor() {
    super()
    this.camera = undefined
    this.children = []
    this.matrix = undefined
    this.rotation = jsToGl([0, 0, 0, 1])
    this.scale = jsToGl([1, 1, 1])
    this.translation = jsToGl([0, 0, 0])
    this.name = undefined
    this.mesh = undefined
    this.skin = undefined

    // non gltf
    // this.worldTransform = mat4.create()
    // this.inverseWorldTransform = mat4.create()
    // this.normalMatrix = mat4.create()
    this.light = undefined
    this.changed = true

    this.animationRotation = undefined
    this.animationTranslation = undefined
    this.animationScale = undefined
  }

  fromJson(json) {
    super.fromJson(json)
  }

  initGl(gltf, parent) {
    let treeItem
    if (this.extras) {
      if (window.zeaCad) {
        // Note: For tool to work the same on zcad data as GLTF, the data should try to use CADBodes
        // when weh can determine that the object is a body.
        const { CADBody } = zeaCad
        treeItem = new CADBody(this.name)
      } else {
        treeItem = new TreeItem(this.name)
      }
      for (let key in this.extras) {
        const value = this.extras[key]
        if (typeof value == 'string') {
          treeItem.addParameter(new StringParameter(key, value))
        } else if (typeof value == 'boolean') {
          treeItem.addParameter(new BooleanParameter(key, value))
        } else if (typeof value == 'number') {
          treeItem.addParameter(new NumberParameter(key, value))
        } else if (typeof value == 'object') {
          treeItem.addParameter(new Parameter(key, value, 'json'))
        }
      }
      // Note: zcad files add metadata as parameters, but GLTF just uses this JSON object.
      // For tool to work the same on zcad data as GLTF, the data should be assigned ini the same way.
      // Note: as we migrate to WebAssembly, using json won't be an option.
      treeItem.extras = this.extras
    } else {
      treeItem = new TreeItem(this.name)
    }

    const xfo = new Xfo()
    if (this.matrix !== undefined) {
      const mat4 = new Mat4(Float32Array.from(this.matrix))
      xfo.setFromMat4(mat4)
    } else {
      if (this.scale !== undefined) {
        xfo.sc.set(...this.scale)
      }

      if (this.rotation !== undefined) {
        xfo.ori.set(...this.rotation)
      }

      if (this.translation !== undefined) {
        xfo.tr.set(...this.translation)
      }
    }
    treeItem.getParameter('LocalXfo').setValue(xfo)

    this.children.forEach((index) => {
      const childNode = gltf.nodes[index]
      childNode.initGl(gltf, treeItem)
    })

    if (this.mesh != undefined) {
      const mesh = gltf.meshes[this.mesh]
      mesh.initGl(gltf, treeItem)
    }
    parent.addChild(treeItem, false)
  }

  applyMatrix(matrixData) {
    this.matrix = jsToGl(matrixData)

    mat4.getScaling(this.scale, this.matrix)

    // To extract a correct rotation, the scaling component must be eliminated.
    const mn = mat4.create()
    for (const col of [0, 1, 2]) {
      mn[col] = this.matrix[col] / this.scale[0]
      mn[col + 4] = this.matrix[col + 4] / this.scale[1]
      mn[col + 8] = this.matrix[col + 8] / this.scale[2]
    }
    mat4.getRotation(this.rotation, mn)
    quat.normalize(this.rotation, this.rotation)

    mat4.getTranslation(this.translation, this.matrix)

    this.changed = true
  }

  // vec3
  applyTranslationAnimation(translation) {
    this.animationTranslation = translation
    this.changed = true
  }

  // quat
  applyRotationAnimation(rotation) {
    this.animationRotation = rotation
    this.changed = true
  }

  // vec3
  applyScaleAnimation(scale) {
    this.animationScale = scale
    this.changed = true
  }

  resetTransform() {
    this.rotation = jsToGl([0, 0, 0, 1])
    this.scale = jsToGl([1, 1, 1])
    this.translation = jsToGl([0, 0, 0])
    this.changed = true
  }

  getLocalTransform() {
    if (this.transform === undefined || this.changed) {
      this.transform = mat4.create()
      const translation = this.animationTranslation !== undefined ? this.animationTranslation : this.translation
      const rotation = this.animationRotation !== undefined ? this.animationRotation : this.rotation
      const scale = this.animationScale !== undefined ? this.animationScale : this.scale
      mat4.fromRotationTranslationScale(this.transform, rotation, translation, scale)
      this.changed = false
    }

    return mat4.clone(this.transform)
  }
}

export { gltfNode }
