import { MyCustomTreeItem } from './MyCustomTreeItem'
import { MyCustomRenderShader } from './MyCustomRenderShader'

import { TreeItem, GLPass, GLMesh, PassType, Cuboid } from '@zeainc/zea-engine'

/** Class representing a GL treeItems pass.
 * @extends GLPass
 * @private
 */
class MyCustomRenderPass extends GLPass {
  /**
   * Create a GL treeItems pass.
   */
  constructor() {
    super()
    this.customItemBindings = []
    this.highlightedItems = new Set()
  }

  /**
   * Returns the pass type. OPAQUE passes are always rendered first, followed by TRANSPARENT passes, and finally OVERLAY.
   * @return {number} - The pass type value.
   */
  getPassType() {
    return PassType.OPAQUE
  }

  /**
   * The init method.
   * @param {any} renderer - The renderer value.
   * @param {any} passIndex - The passIndex value.
   */
  init(renderer, passIndex) {
    super.init(renderer, passIndex)

    const gl = this.__renderer.gl
    this.glgeom = new GLMesh(gl, new Cuboid(1, 1, 1))

    this.glshader = new MyCustomRenderShader(gl)
  }

  /**
   * The itemAddedToScene method is called on each pass when a new item
   * is added to the scene, and the renderer must decide how to render it.
   * It allows Passes to select geometries to handle the drawing of.
   * @param {TreeItem} treeItem - The treeItem value.
   * @param {object} rargs - Extra return values are passed back in this object.
   * The object contains a parameter 'continueInSubTree', which can be set to false,
   * so the subtree of this node will not be traversed after this node is handled.
   * @return {Boolean} - The return value.
   */
  itemAddedToScene(treeItem, rargs) {
    if (treeItem instanceof MyCustomTreeItem) {
      this.bindTreeItem(treeItem)
      return true
    }
    return false
  }

  /**
   * The itemRemovedFromScene method is called on each pass when aa item
   * is removed to the scene, and the pass must handle cleaning up any resources.
   * @param {TreeItem} treeItem - The treeItem value.
   * @param {object} rargs - Extra return values are passed back in this object.
   * @return {Boolean} - The return value.
   */
  itemRemovedFromScene(treeItem, rargs) {
    if (treeItem instanceof MyCustomTreeItem) {
      this.unbindTreeItem(treeItem)
      return true
    }
    return false
  }

  // ///////////////////////////////////
  // Bind to Render Tree

  /**
   * The bindTreeItem method.
   * @param {any} customItem - The customItem value.
   */
  bindTreeItem(customItem) {
    const binding = {
      customItem: customItem,
      metallic: 0.98,
      reflectance: 0.75,
      roughness: 0.5,
      modelMatrixChangeHandler: () => {
        binding.modelMatrix = customItem.getParameter('GlobalXfo').getValue().toMat4().asArray()
        this.emit('updated') // tell the renderer we need to redraw
      },
      sizeChangeHandler: () => {
        binding.size = customItem.getParameter('Size').getValue().asArray()
        this.emit('updated') // tell the renderer we need to redraw
      },
      materialChangeHandler: () => {
        binding.color = customItem.getParameter('Color').getValue().asArray()
        binding.metallic = customItem.getParameter('Metallic').getValue()
        binding.reflectance = customItem.getParameter('Reflectance').getValue()
        binding.roughness = customItem.getParameter('Roughness').getValue()
        this.emit('updated') // tell the renderer we need to redraw
      },
      highlightChangeHandler: () => {
        const color = customItem.getHighlight()
        if (color) {
          binding.highlightColor = color.asArray()
          this.highlightedItems.add(binding)
        } else {
          this.highlightedItems.delete(binding)
        }
        this.emit('updated') // tell the renderer we need to redraw
      },
      cuttingPlaneChangeHandler: () => {
        binding.isCutawayEnabled = customItem.isCutawayEnabled()
        if (binding.isCutawayEnabled) {
          binding.cutAwayVector = customItem.getCutVector().asArray()
          binding.cutDist = customItem.getCutDist()
        }
        this.emit('updated') // tell the renderer we need to redraw
      },
    }

    // If the GlobalXfo changes, we need to update the renderer cache.
    binding.modelMatrixChangeHandler()
    binding.sizeChangeHandler()
    binding.materialChangeHandler()
    binding.highlightChangeHandler()
    binding.cuttingPlaneChangeHandler()
    customItem.getParameter('GlobalXfo').on('valueChanged', binding.modelMatrixChangeHandler)
    customItem.getParameter('Size').on('valueChanged', binding.sizeChangeHandler)
    customItem.getParameter('Color').on('valueChanged', binding.materialChangeHandler)
    customItem.getParameter('Reflectance').on('valueChanged', binding.materialChangeHandler)
    customItem.getParameter('Metallic').on('valueChanged', binding.materialChangeHandler)
    customItem.getParameter('Roughness').on('valueChanged', binding.materialChangeHandler)
    customItem.on('highlightChanged', binding.highlightChangeHandler)
    customItem.on('cutAwayChanged', binding.cuttingPlaneChangeHandler)

    this.customItemBindings.push(binding)
    this.emit('updated')
  }

  /**
   * The unbindTreeItem method.
   * @param {any} customItem - The customItem value.
   */
  unbindTreeItem(customItem) {
    const index = this.customItemBindings.find((binding) => binding.customItem == customItem)
    const binding = this.customItemBindings[index]
    customItem.getParameter('GlobalXfo').off('valueChanged', binding.modelMatrixChangeHandler)
    customItem.getParameter('Size').off('valueChanged', binding.sizeChangeHandler)
    customItem.getParameter('Color').off('valueChanged', binding.materialChangeHandler)
    customItem.getParameter('Reflectance').off('valueChanged', binding.materialChangeHandler)
    customItem.getParameter('Metallic').off('valueChanged', binding.materialChangeHandler)
    customItem.getParameter('Roughness').off('valueChanged', binding.materialChangeHandler)
    customItem.off('highlightChanged', binding.highlightChangeHandler)
    this.customItemBindings.splice(index, 1)
    if (this.highlightedItems.has()) this.highlightedItems.remove(binding)
    this.emit('updated')
  }

  /**
   * The sort method.
   * @param {any} renderstate - The renderstate value.
   */
  draw(renderstate) {
    const gl = this.__gl

    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.depthMask(true)

    this.glshader.bind(renderstate, 'DRAW_COLOR')
    this.glgeom.bind(renderstate)

    const unifs = renderstate.unifs
    const {
      modelMatrix,
      boxSize,
      color,
      metallic,
      roughness,
      reflectance,
      isCutawayEnabled,
      cutAwayVector,
      cutDist,
    } = unifs

    this.customItemBindings.forEach((binding) => {
      gl.uniformMatrix4fv(modelMatrix.location, false, binding.modelMatrix)
      gl.uniform3fv(boxSize.location, binding.size)
      gl.uniform4fv(color.location, binding.color)
      gl.uniform1f(metallic.location, binding.metallic)
      gl.uniform1f(roughness.location, binding.roughness)
      gl.uniform1f(reflectance.location, binding.reflectance)

      gl.uniform1i(isCutawayEnabled.location, binding.isCutawayEnabled)
      if (binding.isCutawayEnabled) {
        gl.uniform3fv(cutAwayVector.location, binding.cutAwayVector)
        gl.uniform1f(cutDist.location, binding.cutDist)
      }

      renderstate.bindViewports(unifs, () => {
        this.glgeom.draw(renderstate)
      })
    })
  }

  /**
   * The drawHighlightedGeoms method.
   * @param {any} renderstate - The renderstate value.
   */
  drawHighlightedGeoms(renderstate) {
    const gl = this.__gl

    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.depthMask(true)

    this.glshader.bind(renderstate, 'DRAW_HIGHLIGHT')
    this.glgeom.bind(renderstate)

    const unifs = renderstate.unifs
    const { modelMatrix, boxSize, highlightColor, isCutawayEnabled, cutAwayVector, cutDist } = unifs

    this.highlightedItems.forEach((binding) => {
      gl.uniformMatrix4fv(modelMatrix.location, false, binding.modelMatrix)
      gl.uniform3fv(boxSize.location, binding.size)
      gl.uniform4fv(highlightColor.location, binding.highlightColor)

      gl.uniform1i(isCutawayEnabled.location, binding.isCutawayEnabled)
      if (binding.isCutawayEnabled) {
        gl.uniform3fv(cutAwayVector.location, binding.cutAwayVector)
        gl.uniform1f(cutDist.location, binding.cutDist)
      }

      renderstate.bindViewports(unifs, () => {
        this.glgeom.draw(renderstate)
      })
    })
  }

  /**
   * The drawGeomData method.
   * @param {any} renderstate - The renderstate value.
   */
  drawGeomData(renderstate) {
    const gl = this.__gl

    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)
    gl.depthMask(true)

    this.glshader.bind(renderstate, 'DRAW_GEOMDATA')
    this.glgeom.bind(renderstate)

    const unifs = renderstate.unifs
    const { modelMatrix, boxSize, passId, itemId, isCutawayEnabled, cutAwayVector, cutDist } = unifs

    this.customItemBindings.forEach((binding, index) => {
      gl.uniformMatrix4fv(modelMatrix.location, false, binding.modelMatrix)
      gl.uniform3fv(boxSize.location, binding.size)
      gl.uniform1i(passId.location, this.__passIndex)
      gl.uniform1i(itemId.location, index)

      gl.uniform1i(isCutawayEnabled.location, binding.isCutawayEnabled)
      if (binding.isCutawayEnabled) {
        gl.uniform3fv(cutAwayVector.location, binding.cutAwayVector)
        gl.uniform1f(cutDist.location, binding.cutDist)
      }

      renderstate.bindViewports(unifs, () => {
        this.glgeom.draw(renderstate)
      })
    })
  }

  /**
   * The getGeomItemAndDist method.
   * @param {any} geomData - The geomData value.
   * @return {any} - The return value.
   */
  getGeomItemAndDist(geomData) {
    const itemId = Math.round(geomData[1])
    const dist = geomData[3]

    const binding = this.customItemBindings[itemId]
    if (binding) {
      return {
        geomItem: binding.customItem,
        dist,
      }
    }
  }
}

export { MyCustomRenderPass }
