import { initGlForMembers } from './utils.js'
import { GltfObject } from './gltf_object.js'
import { gltfBuffer } from './buffer.js'
import { gltfBufferView } from './buffer_view.js'
import { DracoDecoder } from '../ResourceLoader/draco.js'
import { GL } from '../Renderer/webgl.js'
import { Box3, Material, PointsProxy, LinesProxy, MeshProxy, Vec3, GeomItem } from '@zeainc/zea-engine'

class gltfPrimitive extends GltfObject {
  constructor() {
    super()
    this.attributes = []
    this.targets = []
    this.indices = undefined
    this.material = undefined
    this.mode = 'TRIANGLES'

    // non gltf
    this.glAttributes = []
    this.defines = []
    this.skip = true
    this.hasWeights = false
    this.hasJoints = false
    this.hasNormals = false
    this.hasTangents = false
    this.hasTexcoord = false
    this.hasColor = false

    // The primitive centroid is used for depth sorting.
    this.centroid = undefined
  }

  initGl(gltf, parentItem) {
    // Use the default glTF material.
    if (this.material === undefined) {
      this.material = gltf.materials.length - 1
    }

    // No members need to be inited...
    // initGlForMembers(this, gltf, parentItem)

    const maxAttributes = 16 //webGlContext.getParameter(GL.MAX_VERTEX_ATTRIBS)

    // https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes

    if (this.extensions !== undefined) {
      if (this.extensions.KHR_draco_mesh_compression !== undefined) {
        const dracoDecoder = new DracoDecoder()
        if (dracoDecoder !== undefined && Object.isFrozen(dracoDecoder)) {
          let dracoGeometry = this.decodeDracoBufferToIntermediate(this.extensions.KHR_draco_mesh_compression, gltf)
          this.copyDataFromDecodedGeometry(gltf, dracoGeometry, this.attributes)
        } else {
          console.warn('Failed to load draco compressed mesh: DracoDecoder not initialized')
        }
      }
    }

    // VERTEX ATTRIBUTES
    for (const attribute of Object.keys(this.attributes)) {
      // if (this.glAttributes.length >= maxAttributes) {
      //   console.error('To many vertex attributes for this primitive, skipping ' + attribute)
      //   break
      // }

      const idx = this.attributes[attribute]
      switch (attribute) {
        case 'POSITION':
          this.skip = false
          this.glAttributes.push({ attribute: attribute, name: 'a_Position', accessor: idx })
          break
        case 'NORMAL':
          this.hasNormals = true
          this.defines.push('HAS_NORMALS 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Normal', accessor: idx })
          break
        case 'TANGENT':
          this.hasTangents = true
          this.defines.push('HAS_TANGENTS 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Tangent', accessor: idx })
          break
        case 'TEXCOORD_0':
          this.hasTexcoord = true
          this.defines.push('HAS_UV_SET1 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_UV1', accessor: idx })
          break
        case 'TEXCOORD_1':
          this.hasTexcoord = true
          this.defines.push('HAS_UV_SET2 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_UV2', accessor: idx })
          break
        case 'COLOR_0':
          this.hasColor = true
          const accessor = gltf.accessors[idx]
          this.defines.push('HAS_VERTEX_COLOR_' + accessor.type + ' 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Color', accessor: idx })
          break
        case 'JOINTS_0':
          this.hasJoints = true
          this.defines.push('HAS_JOINT_SET1 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Joint1', accessor: idx })
          break
        case 'WEIGHTS_0':
          this.hasWeights = true
          this.defines.push('HAS_WEIGHT_SET1 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Weight1', accessor: idx })
          break
        case 'JOINTS_1':
          this.hasJoints = true
          this.defines.push('HAS_JOINT_SET2 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Joint2', accessor: idx })
          break
        case 'WEIGHTS_1':
          this.hasWeights = true
          this.defines.push('HAS_WEIGHT_SET2 1')
          this.glAttributes.push({ attribute: attribute, name: 'a_Weight2', accessor: idx })
          break
        default:
          console.log('Unknown attribute: ' + attribute)
      }
    }

    // MORPH TARGETS
    /*
    if (this.targets !== undefined) {
      let i = 0
      for (const target of this.targets) {
        if (this.glAttributes.length + 3 > maxAttributes) {
          console.error('To many vertex attributes for this primitive, skipping target ' + i)
          break
        }

        for (const attribute of Object.keys(target)) {
          const idx = target[attribute]

          switch (attribute) {
            case 'POSITION':
              this.defines.push('HAS_TARGET_POSITION' + i + ' 1')
              this.glAttributes.push({ attribute: attribute, name: 'a_Target_Position' + i, accessor: idx })
              break
            case 'NORMAL':
              this.defines.push('HAS_TARGET_NORMAL' + i + ' 1')
              this.glAttributes.push({ attribute: attribute, name: 'a_Target_Normal' + i, accessor: idx })
              break
            case 'TANGENT':
              this.defines.push('HAS_TARGET_TANGENT' + i + ' 1')
              this.glAttributes.push({ attribute: attribute, name: 'a_Target_Tangent' + i, accessor: idx })
              break
          }
        }

        ++i
      }
    }
    */

    const positionsAccessor = gltf.accessors[this.attributes.POSITION]
    const positions = positionsAccessor.getTypedView(gltf)
    const geomProxyData = {
      geomBuffers: {
        numVertices: positionsAccessor.count,
        attrBuffers: {},
      },
      bbox: new Box3(new Vec3(...positionsAccessor.min), new Vec3(...positionsAccessor.max)),
    }

    if (this.indices !== undefined) {
      const indicesAccessor = gltf.accessors[this.indices]
      const indices = indicesAccessor.getTypedView(gltf)
      geomProxyData.geomBuffers.indices = indices
    }

    for (const attribute of Object.keys(this.attributes)) {
      const idx = this.attributes[attribute]
      const accessor = gltf.accessors[idx]
      const typedArray = accessor.getTypedView(gltf)

      switch (attribute) {
        case 'POSITION':
          geomProxyData.geomBuffers.attrBuffers['positions'] = {
            dataType: 'Vec3',
            normalized: false,
            values: typedArray,
          }
          if (accessor.count != typedArray.length / 3) {
            // There are geometries where the typed array length doesn't match the attribute count, and
            // I am not sure how to deal with them. Seen in TC050-017-015.glb fromm PulsePLM.
            // e.g. a typed array of 15 for an accessor of count 4. So not 3 * 4 or even 4 * 4.
            // My only idea is that the values are somehow aligned to a 4 flouat stride, but then missing
            // the last value for some strange reason.
            // This hack fixes it, AFAIKS, but maybe its not the correct fix.
            const fixedPositions = new Float32Array(positionsAccessor.count * 3)
            let src = 0
            for (let i = 0; i < typedArray.length; i += 3) {
              fixedPositions[i] = typedArray[src]
              fixedPositions[i + 1] = typedArray[src + 1]
              fixedPositions[i + 2] = typedArray[src + 2]
              src += 4 // Skip 4 floats instead of 3
            }
            geomProxyData.geomBuffers.attrBuffers['positions'].values = fixedPositions
          }
          break
        case 'NORMAL':
          geomProxyData.geomBuffers.attrBuffers['normals'] = {
            dataType: 'Vec3',
            normalized: true,
            values: typedArray,
          }
          break
        case 'TEXCOORD_0':
          geomProxyData.geomBuffers.attrBuffers['texCoords'] = {
            dataType: 'Vec2',
            normalized: false,
            values: typedArray,
          }
          break
        case 'COLOR_0':
          geomProxyData.geomBuffers.attrBuffers['vertexColors'] = {
            dataType: 'Color',
            normalized: false,
            values: typedArray,
          }
          break
      }
    }

    // https://github.com/KhronosGroup/glTF/blob/master/specification/1.0/schema/mesh.primitive.schema.json
    switch (this.mode) {
      case 'POINTS':
      case 0: {
        geomProxyData.name = 'GLTFPoints'
        const pointsProxy = new PointsProxy(geomProxyData)
        const material = gltf.materials[this.material]
        const geomItem = new GeomItem('Points', pointsProxy, material.zeaMaterial)
        parentItem.addChild(geomItem, false)
        break
      }
      case 'LINES':
      case 1: {
        geomProxyData.name = 'GLTFLines'
        const linesProxy = new LinesProxy(geomProxyData)
        const material = gltf.materials[this.material]
        const geomItem = new GeomItem('Lines', linesProxy, material.zeaMaterial)
        parentItem.addChild(geomItem, false)
        break
      }
      case 'TRIANGLES':
      case 4: {
        geomProxyData.name = 'GLTFMesh'
        const meshProxy = new MeshProxy(geomProxyData)
        const material = gltf.materials[this.material]
        const geomItem = new GeomItem('Mesh', meshProxy, material.zeaMaterial)
        parentItem.addChild(geomItem, false)
        break
      }
    }
  }

  computeCentroid(gltf, geomProxyData) {
    const positionsAccessor = gltf.accessors[this.attributes.POSITION]
    const positions = positionsAccessor.getTypedView(gltf)

    if (this.indices !== undefined) {
      // Primitive has indices.

      const indicesAccessor = gltf.accessors[this.indices]

      const indices = indicesAccessor.getTypedView(gltf)

      const acc = new Float32Array(3)

      for (let i = 0; i < indices.length; i++) {
        const offset = 3 * indices[i]
        acc[0] += positions[offset]
        acc[1] += positions[offset + 1]
        acc[2] += positions[offset + 2]
      }

      const centroid = new Float32Array([acc[0] / indices.length, acc[1] / indices.length, acc[2] / indices.length])

      this.centroid = centroid
    } else {
      // Primitive does not have indices.

      const acc = new Float32Array(3)

      for (let i = 0; i < positions.length; i += 3) {
        acc[0] += positions[i]
        acc[1] += positions[i + 1]
        acc[2] += positions[i + 2]
      }

      const positionVectors = positions.length / 3

      const centroid = new Float32Array([acc[0] / positionVectors, acc[1] / positionVectors, acc[2] / positionVectors])

      this.centroid = centroid
    }
  }

  getShaderIdentifier() {
    return 'primitive.vert'
  }

  getDefines() {
    return this.defines
  }

  fromJson(jsonPrimitive) {
    super.fromJson(jsonPrimitive)

    if (jsonPrimitive.extensions !== undefined) {
      this.fromJsonPrimitiveExtensions(jsonPrimitive.extensions)
    }
  }

  fromJsonPrimitiveExtensions(jsonExtensions) {
    if (jsonExtensions.KHR_materials_variants !== undefined) {
      this.fromJsonVariants(jsonExtensions.KHR_materials_variants)
    }
  }

  fromJsonVariants(jsonVariants) {
    if (jsonVariants.mappings !== undefined) {
      this.mappings = jsonVariants.mappings
    }
  }

  copyDataFromDecodedGeometry(gltf, dracoGeometry, primitiveAttributes) {
    // indices
    let indexBuffer = dracoGeometry.index.array
    this.loadBufferIntoGltf(indexBuffer, gltf, this.indices, 34963, 'index buffer view')

    // Position
    if (dracoGeometry.attributes.POSITION !== undefined) {
      let positionBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.POSITION.array,
        dracoGeometry.attributes.POSITION.componentType
      )
      this.loadBufferIntoGltf(positionBuffer, gltf, primitiveAttributes['POSITION'], 34962, 'position buffer view')
    }

    // Normal
    if (dracoGeometry.attributes.NORMAL !== undefined) {
      let normalBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.NORMAL.array,
        dracoGeometry.attributes.NORMAL.componentType
      )
      this.loadBufferIntoGltf(normalBuffer, gltf, primitiveAttributes['NORMAL'], 34962, 'normal buffer view')
    }

    // TEXCOORD_0
    if (dracoGeometry.attributes.TEXCOORD_0 !== undefined) {
      let uvBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.TEXCOORD_0.array,
        dracoGeometry.attributes.TEXCOORD_0.componentType
      )
      this.loadBufferIntoGltf(uvBuffer, gltf, primitiveAttributes['TEXCOORD_0'], 34962, 'TEXCOORD_0 buffer view')
    }

    // TEXCOORD_1
    if (dracoGeometry.attributes.TEXCOORD_1 !== undefined) {
      let uvBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.TEXCOORD_1.array,
        dracoGeometry.attributes.TEXCOORD_1.componentType
      )
      this.loadBufferIntoGltf(uvBuffer, gltf, primitiveAttributes['TEXCOORD_1'], 34962, 'TEXCOORD_1 buffer view')
    }

    // Tangent
    if (dracoGeometry.attributes.TANGENT !== undefined) {
      let tangentBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.TANGENT.array,
        dracoGeometry.attributes.TANGENT.componentType
      )
      this.loadBufferIntoGltf(tangentBuffer, gltf, primitiveAttributes['TANGENT'], 34962, 'Tangent buffer view')
    }

    // Color
    if (dracoGeometry.attributes.COLOR_0 !== undefined) {
      let colorBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.COLOR_0.array,
        dracoGeometry.attributes.COLOR_0.componentType
      )
      this.loadBufferIntoGltf(colorBuffer, gltf, primitiveAttributes['COLOR_0'], 34962, 'color buffer view')
    }

    // JOINTS_0
    if (dracoGeometry.attributes.JOINTS_0 !== undefined) {
      let jointsBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.JOINTS_0.array,
        dracoGeometry.attributes.JOINTS_0.componentType
      )
      this.loadBufferIntoGltf(jointsBuffer, gltf, primitiveAttributes['JOINTS_0'], 34963, 'JOINTS_0 buffer view')
    }

    // WEIGHTS_0
    if (dracoGeometry.attributes.WEIGHTS_0 !== undefined) {
      let weightsBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.WEIGHTS_0.array,
        dracoGeometry.attributes.WEIGHTS_0.componentType
      )
      this.loadBufferIntoGltf(weightsBuffer, gltf, primitiveAttributes['WEIGHTS_0'], 34963, 'WEIGHTS_0 buffer view')
    }

    // JOINTS_1
    if (dracoGeometry.attributes.JOINTS_1 !== undefined) {
      let jointsBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.JOINTS_1.array,
        dracoGeometry.attributes.JOINTS_1.componentType
      )
      this.loadBufferIntoGltf(jointsBuffer, gltf, primitiveAttributes['JOINTS_1'], 34963, 'JOINTS_1 buffer view')
    }

    // WEIGHTS_1
    if (dracoGeometry.attributes.WEIGHTS_1 !== undefined) {
      let weightsBuffer = this.loadArrayIntoArrayBuffer(
        dracoGeometry.attributes.WEIGHTS_1.array,
        dracoGeometry.attributes.WEIGHTS_1.componentType
      )
      this.loadBufferIntoGltf(weightsBuffer, gltf, primitiveAttributes['WEIGHTS_1'], 34963, 'WEIGHTS_1 buffer view')
    }
  }

  loadBufferIntoGltf(buffer, gltf, gltfAccessorIndex, gltfBufferViewTarget, gltfBufferViewName) {
    const gltfBufferObj = new gltfBuffer()
    gltfBufferObj.byteLength = buffer.byteLength
    gltfBufferObj.buffer = buffer
    gltf.buffers.push(gltfBufferObj)

    const gltfBufferViewObj = new gltfBufferView()
    gltfBufferViewObj.buffer = gltf.buffers.length - 1
    gltfBufferViewObj.byteLength = buffer.byteLength
    if (gltfBufferViewName !== undefined) {
      gltfBufferViewObj.name = gltfBufferViewName
    }
    gltfBufferViewObj.target = gltfBufferViewTarget
    gltf.bufferViews.push(gltfBufferViewObj)

    gltf.accessors[gltfAccessorIndex].byteOffset = 0
    gltf.accessors[gltfAccessorIndex].bufferView = gltf.bufferViews.length - 1
  }

  loadArrayIntoArrayBuffer(arrayData, componentType) {
    let arrayBuffer
    switch (componentType) {
      case 'Int8Array':
        arrayBuffer = new ArrayBuffer(arrayData.length)
        let int8Array = new Int8Array(arrayBuffer)
        int8Array.set(arrayData)
        break
      case 'Uint8Array':
        arrayBuffer = new ArrayBuffer(arrayData.length)
        let uint8Array = new Uint8Array(arrayBuffer)
        uint8Array.set(arrayData)
        break
      case 'Int16Array':
        arrayBuffer = new ArrayBuffer(arrayData.length * 2)
        let int16Array = new Int16Array(arrayBuffer)
        int16Array.set(arrayData)
        break
      case 'Uint16Array':
        arrayBuffer = new ArrayBuffer(arrayData.length * 2)
        let uint16Array = new Uint16Array(arrayBuffer)
        uint16Array.set(arrayData)
        break
      case 'Int32Array':
        arrayBuffer = new ArrayBuffer(arrayData.length * 4)
        let int32Array = new Int32Array(arrayBuffer)
        int32Array.set(arrayData)
        break
      case 'Uint32Array':
        arrayBuffer = new ArrayBuffer(arrayData.length * 4)
        let uint32Array = new Uint32Array(arrayBuffer)
        uint32Array.set(arrayData)
        break
      default:
      case 'Float32Array':
        arrayBuffer = new ArrayBuffer(arrayData.length * 4)
        let floatArray = new Float32Array(arrayBuffer)
        floatArray.set(arrayData)
        break
    }

    return arrayBuffer
  }

  decodeDracoBufferToIntermediate(dracoExtension, gltf) {
    let dracoBufferViewIDX = dracoExtension.bufferView

    const origGltfDrBufViewObj = gltf.bufferViews[dracoBufferViewIDX]
    const origGltfDracoBuffer = gltf.buffers[origGltfDrBufViewObj.buffer]

    const totalBuffer = new Int8Array(origGltfDracoBuffer.buffer)
    const actualBuffer = totalBuffer.slice(
      origGltfDrBufViewObj.byteOffset,
      origGltfDrBufViewObj.byteOffset + origGltfDrBufViewObj.byteLength
    )

    // decode draco buffer to geometry intermediate
    let dracoDecoder = new DracoDecoder()
    let draco = dracoDecoder.module
    let decoder = new draco.Decoder()
    let decoderBuffer = new draco.DecoderBuffer()
    decoderBuffer.Init(actualBuffer, origGltfDrBufViewObj.byteLength)
    let geometry = this.decodeGeometry(draco, decoder, decoderBuffer, dracoExtension.attributes, gltf)

    draco.destroy(decoderBuffer)

    return geometry
  }

  getDracoArrayTypeFromComponentType(componentType) {
    switch (componentType) {
      case GL.BYTE:
        return 'Int8Array'
      case GL.UNSIGNED_BYTE:
        return 'Uint8Array'
      case GL.SHORT:
        return 'Int16Array'
      case GL.UNSIGNED_SHORT:
        return 'Uint16Array'
      case GL.INT:
        return 'Int32Array'
      case GL.UNSIGNED_INT:
        return 'Uint32Array'
      case GL.FLOAT:
        return 'Float32Array'
      default:
        return 'Float32Array'
    }
  }

  decodeGeometry(draco, decoder, decoderBuffer, gltfDracoAttributes, gltf) {
    let dracoGeometry
    let decodingStatus

    // decode mesh in draco decoder
    let geometryType = decoder.GetEncodedGeometryType(decoderBuffer)
    if (geometryType === draco.TRIANGULAR_MESH) {
      dracoGeometry = new draco.Mesh()
      decodingStatus = decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry)
    } else {
      throw new Error('DRACOLoader: Unexpected geometry type.')
    }

    if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
      throw new Error('DRACOLoader: Decoding failed: ' + decodingStatus.error_msg())
    }

    let geometry = { index: null, attributes: {} }
    let vertexCount = dracoGeometry.num_points()

    // Gather all vertex attributes.
    for (let dracoAttr in gltfDracoAttributes) {
      let componentType = GL.BYTE
      let accessotVertexCount
      // find gltf accessor for this draco attribute
      for (const [key, value] of Object.entries(this.attributes)) {
        if (key === dracoAttr) {
          componentType = gltf.accessors[value].componentType
          accessotVertexCount = gltf.accessors[value].count
          break
        }
      }

      // check if vertex count matches
      if (vertexCount !== accessotVertexCount) {
        throw new Error(
          `DRACOLoader: Accessor vertex count ${accessotVertexCount} does not match draco decoder vertex count  ${vertexCount}`
        )
      }
      componentType = this.getDracoArrayTypeFromComponentType(componentType)

      let dracoAttribute = decoder.GetAttributeByUniqueId(dracoGeometry, gltfDracoAttributes[dracoAttr])
      var tmpObj = this.decodeAttribute(draco, decoder, dracoGeometry, dracoAttr, dracoAttribute, componentType)
      geometry.attributes[tmpObj.name] = tmpObj
    }

    // Add index buffer
    if (geometryType === draco.TRIANGULAR_MESH) {
      // Generate mesh faces.
      let numFaces = dracoGeometry.num_faces()
      let numIndices = numFaces * 3
      let dataSize = numIndices * 4
      let ptr = draco._malloc(dataSize)
      decoder.GetTrianglesUInt32Array(dracoGeometry, dataSize, ptr)
      let index = new Uint32Array(draco.HEAPU32.buffer, ptr, numIndices).slice()
      draco._free(ptr)

      geometry.index = { array: index, itemSize: 1 }
    }

    draco.destroy(dracoGeometry)
    return geometry
  }

  decodeAttribute(draco, decoder, dracoGeometry, attributeName, attribute, attributeType) {
    let numComponents = attribute.num_components()
    let numPoints = dracoGeometry.num_points()
    let numValues = numPoints * numComponents

    let ptr
    let array

    let dataSize
    switch (attributeType) {
      case 'Float32Array':
        dataSize = numValues * 4
        ptr = draco._malloc(dataSize)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_FLOAT32, dataSize, ptr)
        array = new Float32Array(draco.HEAPF32.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      case 'Int8Array':
        ptr = draco._malloc(numValues)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_INT8, numValues, ptr)
        array = new Int8Array(draco.HEAP8.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      case 'Int16Array':
        dataSize = numValues * 2
        ptr = draco._malloc(dataSize)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_INT16, dataSize, ptr)
        array = new Int16Array(draco.HEAP16.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      case 'Int32Array':
        dataSize = numValues * 4
        ptr = draco._malloc(dataSize)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_INT32, dataSize, ptr)
        array = new Int32Array(draco.HEAP32.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      case 'Uint8Array':
        ptr = draco._malloc(numValues)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_UINT8, numValues, ptr)
        array = new Uint8Array(draco.HEAPU8.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      case 'Uint16Array':
        dataSize = numValues * 2
        ptr = draco._malloc(dataSize)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_UINT16, dataSize, ptr)
        array = new Uint16Array(draco.HEAPU16.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      case 'Uint32Array':
        dataSize = numValues * 4
        ptr = draco._malloc(dataSize)
        decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_UINT32, dataSize, ptr)
        array = new Uint32Array(draco.HEAPU32.buffer, ptr, numValues).slice()
        draco._free(ptr)
        break

      default:
        throw new Error('DRACOLoader: Unexpected attribute type.')
    }

    return {
      name: attributeName,
      array: array,
      itemSize: numComponents,
      componentType: attributeType,
    }
  }
}

export { gltfPrimitive }
