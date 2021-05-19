import { GL } from '../Renderer/webgl.js'
import { GltfObject } from './gltf_object.js'

const WEBGL_COMPONENT_TYPES = {}
WEBGL_COMPONENT_TYPES[GL.BYTE] = Int8Array
WEBGL_COMPONENT_TYPES[GL.UNSIGNED_BYTE] = Uint8Array
WEBGL_COMPONENT_TYPES[GL.SHORT] = Int16Array
WEBGL_COMPONENT_TYPES[GL.UNSIGNED_SHORT] = Uint16Array
WEBGL_COMPONENT_TYPES[GL.UNSIGNED_INT] = Uint32Array
WEBGL_COMPONENT_TYPES[GL.FLOAT] = Float32Array

const WEBGL_TYPE_SIZES = {
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
}

function decode16BitFloat(h) {
  const s = (h & 0x8000) >> 15
  const e = (h & 0x7c00) >> 10
  const f = h & 0x03ff

  if (e == 0) {
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10))
  } else if (e == 0x1f) {
    return f ? NaN : (s ? -1 : 1) * Infinity
  }

  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10))
}

class gltfAccessor extends GltfObject {
  constructor() {
    super()
    this.bufferView = undefined
    this.byteOffset = 0
    this.componentType = undefined
    this.normalized = false
    this.count = undefined
    this.type = undefined
    this.max = undefined
    this.min = undefined
    this.sparse = undefined
    this.name = undefined

    // non gltf
    this.glBuffer = undefined
    this.typedView = undefined
    this.filteredView = undefined
    this.normalizedFilteredView = undefined
    this.normalizedTypedView = undefined
  }

  // getTypedView provides a view to the accessors data in form of
  // a TypedArray. This data can directly be passed to vertexAttribPointer
  getTypedView(gltf, buffers) {
    if (this.typedView !== undefined) {
      return this.typedView
    }

    if (this.bufferView !== undefined) {
      const bufferView = gltf.bufferViews[this.bufferView]
      const buffer = gltf.buffers[bufferView.buffer]
      const byteOffset = this.byteOffset + bufferView.byteOffset

      if (bufferView.extensions && bufferView.extensions['EXT_meshopt_compression']) {
        const extensionDef = bufferView.extensions['EXT_meshopt_compression']
        const decoder = gltf.extensions['EXT_meshopt_compression']

        const byteOffset = extensionDef.byteOffset || 0
        const byteLength = extensionDef.byteLength || 0

        const count = extensionDef.count
        const stride = extensionDef.byteStride

        const result = new ArrayBuffer(count * stride)
        const source = new Uint8Array(buffers[0], byteOffset, byteLength)

        decoder.decodeGltfBuffer(new Uint8Array(result), count, stride, source, extensionDef.mode, extensionDef.filter)

        const itemSize = WEBGL_TYPE_SIZES[this.type]
        const TypedArray = WEBGL_COMPONENT_TYPES[this.componentType]
        const elementBytes = TypedArray.BYTES_PER_ELEMENT
        const itemBytes = elementBytes * itemSize
        const byteStride = this.bufferView !== undefined ? gltf.bufferViews[this.bufferView].byteStride : undefined
        if (byteStride && byteStride !== itemBytes) {
          console.log(byteStride, itemBytes)
        }

        console.log(byteStride, itemBytes)

        buffer.buffer = result

        this.typedView = new TypedArray(result, this.byteOffset, this.count * itemSize)
        return this.typedView
      }

      const componentSize = this.getComponentSize(this.componentType)
      let componentCount = this.getComponentCount(this.type)

      let arrayLength = 0
      if (bufferView.byteStride !== 0) {
        if (componentSize !== 0) {
          arrayLength = (bufferView.byteStride / componentSize) * (this.count - 1) + componentCount
        } else {
          console.warn("Invalid component type in accessor '" + (this.name ? this.name : '') + "'")
        }
      } else {
        arrayLength = this.count * componentCount
      }

      if (arrayLength * componentSize > buffer.buffer.byteLength - byteOffset) {
        arrayLength = (buffer.buffer.byteLength - byteOffset) / componentSize
        console.warn("Count in accessor '" + (this.name ? this.name : '') + "' is too large.")
      }

      switch (this.componentType) {
        case GL.BYTE:
          this.typedView = new Int8Array(buffer.buffer, byteOffset, arrayLength)
          break
        case GL.UNSIGNED_BYTE:
          this.typedView = new Uint8Array(buffer.buffer, byteOffset, arrayLength)
          break
        case GL.SHORT:
          this.typedView = new Int16Array(buffer.buffer, byteOffset, arrayLength)
          break
        case GL.UNSIGNED_SHORT:
          this.typedView = new Uint16Array(buffer.buffer, byteOffset, arrayLength)
          break
        case GL.UNSIGNED_INT:
          this.typedView = new Uint32Array(buffer.buffer, byteOffset, arrayLength)
          break
        case GL.FLOAT:
          this.typedView = new Float32Array(buffer.buffer, byteOffset, arrayLength)
          break
      }
    }

    if (this.typedView === undefined) {
      console.warn('Failed to convert buffer view to typed view!: ' + this.bufferView)
    } else if (this.sparse !== undefined) {
      this.applySparse(gltf, this.typedView)
    }

    return this.typedView
  }

  // getNormalizedTypedView provides an alternative view to the accessors data,
  // where quantized data is already normalized. This is useful if the data is not passed
  // to vertexAttribPointer but used immediately (like e.g. animations)
  getNormalizedTypedView(gltf) {
    if (this.normalizedTypedView !== undefined) {
      return this.normalizedTypedView
    }

    const typedView = this.getTypedView(gltf)
    this.normalizedTypedView = this.normalized ? gltfAccessor.dequantize(typedView, this.componentType) : typedView
    return this.normalizedTypedView
  }

  // getDeinterlacedView provides a view to the accessors data in form of
  // a TypedArray. In contrast to getTypedView, getDeinterlacedView deinterlaces
  // data, i.e. stripping padding and unrelated components from the array. It then
  // only contains the data of the accessor
  getDeinterlacedView(gltf) {
    if (this.filteredView !== undefined) {
      return this.filteredView
    }

    if (this.bufferView !== undefined) {
      const bufferView = gltf.bufferViews[this.bufferView]
      const buffer = gltf.buffers[bufferView.buffer]
      const byteOffset = this.byteOffset + bufferView.byteOffset

      const componentSize = this.getComponentSize(this.componentType)
      const componentCount = this.getComponentCount(this.type)
      const arrayLength = this.count * componentCount

      let stride = bufferView.byteStride !== 0 ? bufferView.byteStride : componentCount * componentSize
      const remainingBytes = buffer.buffer.byteLength - byteOffset
      let dv = new DataView(buffer.buffer, byteOffset, Math.min(remainingBytes, this.count * stride))

      let func = dv.getFloat32.bind(dv)
      switch (this.componentType) {
        case GL.BYTE:
          this.filteredView = new Int8Array(arrayLength)
          func = dv.getInt8.bind(dv)
          break
        case GL.UNSIGNED_BYTE:
          this.filteredView = new Uint8Array(arrayLength)
          func = dv.getUint8.bind(dv)
          break
        case GL.SHORT:
          this.filteredView = new Int16Array(arrayLength)
          func = dv.getInt16.bind(dv)
          break
        case GL.UNSIGNED_SHORT:
          // this.filteredView = new Uint16Array(arrayLength)
          // func = dv.getUint16.bind(dv)
          this.filteredView = new Float32Array(arrayLength)
          func = (index) => {
            if (index > arrayLength) return 0.0
            const val = dv.getUint16(index)
            return decode16BitFloat(val)
          }
          break
        case GL.UNSIGNED_INT:
          this.filteredView = new Uint32Array(arrayLength)
          func = dv.getUint32.bind(dv)
          break
        case GL.FLOAT:
          this.filteredView = new Float32Array(arrayLength)
          func = dv.getFloat32.bind(dv)
          break
      }

      for (let i = 0; i < arrayLength; ++i) {
        let offset = Math.floor(i / componentCount) * stride + (i % componentCount) * componentSize
        this.filteredView[i] = func(offset)
      }
    }

    if (this.filteredView === undefined) {
      console.warn('Failed to convert buffer view to filtered view!: ' + this.bufferView)
    } else if (this.sparse !== undefined) {
      this.applySparse(gltf, this.filteredView)
    }

    return this.filteredView
  }

  // getNormalizedDeinterlacedView provides an alternative view to the accessors data,
  // where quantized data is already normalized. This is useful if the data is not passed
  // to vertexAttribPointer but used immediately (like e.g. animations)
  getNormalizedDeinterlacedView(gltf) {
    if (this.normalizedFilteredView !== undefined) {
      return this.normalizedFilteredView
    }

    const filteredView = this.getDeinterlacedView(gltf)
    this.normalizedFilteredView = this.normalized
      ? gltfAccessor.dequantize(filteredView, this.componentType)
      : filteredView
    return this.normalizedFilteredView
  }

  applySparse(gltf, view) {
    // Gather indices.

    const indicesBufferView = gltf.bufferViews[this.sparse.indices.bufferView]
    const indicesBuffer = gltf.buffers[indicesBufferView.buffer]
    const indicesByteOffset = this.sparse.indices.byteOffset + indicesBufferView.byteOffset

    const indicesComponentSize = this.getComponentSize(this.sparse.indices.componentType)
    let indicesComponentCount = 1

    if (indicesBufferView.byteStride !== 0) {
      indicesComponentCount = indicesBufferView.byteStride / indicesComponentSize
    }

    const indicesArrayLength = this.sparse.count * indicesComponentCount

    let indicesTypedView
    switch (this.sparse.indices.componentType) {
      case GL.UNSIGNED_BYTE:
        indicesTypedView = new Uint8Array(indicesBuffer.buffer, indicesByteOffset, indicesArrayLength)
        break
      case GL.UNSIGNED_SHORT:
        indicesTypedView = new Uint16Array(indicesBuffer.buffer, indicesByteOffset, indicesArrayLength)
        break
      case GL.UNSIGNED_INT:
        indicesTypedView = new Uint32Array(indicesBuffer.buffer, indicesByteOffset, indicesArrayLength)
        break
    }

    // Gather values.

    const valuesBufferView = gltf.bufferViews[this.sparse.values.bufferView]
    const valuesBuffer = gltf.buffers[valuesBufferView.buffer]
    const valuesByteOffset = this.sparse.values.byteOffset + valuesBufferView.byteOffset

    const valuesComponentSize = this.getComponentSize(this.componentType)
    let valuesComponentCount = this.getComponentCount(this.type)

    if (valuesBufferView.byteStride !== 0) {
      valuesComponentCount = valuesBufferView.byteStride / valuesComponentSize
    }

    const valuesArrayLength = this.sparse.count * valuesComponentCount

    let valuesTypedView
    switch (this.componentType) {
      case GL.BYTE:
        valuesTypedView = new Int8Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength)
        break
      case GL.UNSIGNED_BYTE:
        valuesTypedView = new Uint8Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength)
        break
      case GL.SHORT:
        valuesTypedView = new Int16Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength)
        break
      case GL.UNSIGNED_SHORT:
        valuesTypedView = new Uint16Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength)
        break
      case GL.UNSIGNED_INT:
        valuesTypedView = new Uint32Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength)
        break
      case GL.FLOAT:
        valuesTypedView = new Float32Array(valuesBuffer.buffer, valuesByteOffset, valuesArrayLength)
        break
    }

    // Overwrite values.

    for (let i = 0; i < this.sparse.count; ++i) {
      for (let k = 0; k < valuesComponentCount; ++k) {
        view[indicesTypedView[i] * valuesComponentCount + k] = valuesTypedView[i * valuesComponentCount + k]
      }
    }
  }

  // dequantize can be used to perform the normalization from WebGL2 vertexAttribPointer explicitly
  static dequantize(typedArray, componentType) {
    switch (componentType) {
      case GL.BYTE:
        return new Float32Array(typedArray).map((c) => Math.max(c / 127.0, -1.0))
      case GL.UNSIGNED_BYTE:
        return new Float32Array(typedArray).map((c) => c / 255.0)
      case GL.SHORT:
        return new Float32Array(typedArray).map((c) => Math.max(c / 32767.0, -1.0))
      case GL.UNSIGNED_SHORT:
        return new Float32Array(typedArray).map((c) => c / 65535.0)
      default:
        return typedArray
    }
  }

  getComponentCount(type) {
    return CompononentCount.get(type)
  }

  getComponentSize(componentType) {
    switch (componentType) {
      case GL.BYTE:
      case GL.UNSIGNED_BYTE:
        return 1
      case GL.SHORT:
      case GL.UNSIGNED_SHORT:
        return 2
      case GL.UNSIGNED_INT:
      case GL.FLOAT:
        return 4
      default:
        return 0
    }
  }

  destroy() {
    if (this.glBuffer !== undefined) {
      // TODO: this breaks the dependency direction
      WebGl.context.deleteBuffer(this.glBuffer)
    }

    this.glBuffer = undefined
  }
}

const CompononentCount = new Map([
  ['SCALAR', 1],
  ['VEC2', 2],
  ['VEC3', 3],
  ['VEC4', 4],
  ['MAT2', 4],
  ['MAT3', 9],
  ['MAT4', 16],
])

export { gltfAccessor }
