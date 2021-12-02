// import axios from 'axios'
import { getContainingFolder } from './utils.js'
import { GltfObject } from './gltf_object.js'
import { resourceLoader } from '@zeainc/zea-engine'

// https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/master/source/gltf/buffer.js

class gltfBuffer extends GltfObject {
  constructor() {
    super()
    this.uri = undefined
    this.byteLength = undefined
    this.name = undefined

    // non gltf
    this.buffer = undefined // raw data blob
  }

  load(gltf, additionalFiles = undefined) {
    if (this.buffer !== undefined) {
      console.error('buffer has already been loaded')
      return
    }

    const self = this
    return new Promise(function (resolve) {
      if (!self.setBufferFromFiles(additionalFiles, resolve) && !self.setBufferFromUri(gltf, resolve)) {
        console.error("Was not able to resolve buffer with uri '%s'", self.uri)
        resolve()
      }
    })
  }

  setBufferFromUri(gltf, callback) {
    if (this.uri === undefined) {
      return false
    }

    const self = this
    // If we detect a base64 encoded uri, then do not buiild a path using the getContainingFolder
    // method. Instead load directly. I can't see how this code works in the example viewer.
    if (this.uri.startsWith('data:application')) {
      resourceLoader.loadFile('binary', this.uri).then(function (data) {
        self.buffer = data
        callback()
      })
    } else {
      resourceLoader.loadFile('binary', getContainingFolder(gltf.path) + this.uri).then(function (data) {
        self.buffer = data
        callback()
      })
    }
    return true
  }

  setBufferFromFiles(files, callback) {
    if (this.uri === undefined || files === undefined) {
      return false
    }

    const foundFile = files.find(function (file) {
      if (file.name === this.uri || file.fullPath === this.uri) {
        return true
      }
    }, this)

    if (foundFile === undefined) {
      return false
    }

    const self = this
    const reader = new FileReader()
    reader.onloadend = function (event) {
      self.buffer = event.target.result
      callback()
    }
    reader.readAsArrayBuffer(foundFile)

    return true
  }
}

export { gltfBuffer }
