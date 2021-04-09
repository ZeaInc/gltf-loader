import { Box3, Color, Vec3Parameter, ColorParameter, BaseGeomItem, Vec3, resourceLoader } from '@zeainc/zea-engine'

/**
 * Base class that represents geometry items with layering, overlaying and cut away features.
 *
 * **Events**
 * * **cutAwayChanged:** Triggered everytime the cutaway variables change(if enabled or not, the vector and the distance).
 * @extends BaseGeomItem
 */
class MyCustomTreeItem extends BaseGeomItem {
  /**
   * Create a base geometry item.
   * @param {string} name - The name of the base geom item.
   */
  constructor(name) {
    super(name)

    this.addParameter(new Vec3Parameter('Size', new Vec3(2, 2, 2)))
    this.addParameter(new ColorParameter('Color', new Color('#cec8c2')))
    this.addParameter(new ColorParameter('Metallic', 0.98))
    this.addParameter(new ColorParameter('Roughness', 0.5))
    this.addParameter(new ColorParameter('Reflectance', 0.75))
  }

  /**
   * The _cleanBoundingBox method.
   * @param {Box3} bbox - The bounding box value.
   * @return {Box3} - The return value.
   * @private
   */
  _cleanBoundingBox(bbox) {
    bbox = super._cleanBoundingBox(bbox)
    const size = this.getParameter('Size').getValue()
    const localBBox = new Box3(size.scale(-0.5), size.scale(0.5))
    bbox.addBox3(localBBox, this.getParameter('GlobalXfo').getValue().toMat4())
    return bbox
  }

  /**
   * The loadDataFile method.
   * @param {string} url - The bounding box value.
   * @return {Promise} - the promise that resolves once the file is loaded
   * @private
   */
  loadDataFile(url) {
    return new Promise((resolve, reject) => {
      resourceLoader.incrementWorkload(1)
      resourceLoader.loadFile('text', url).then(
        (txt) => {
          this.parseData(txt)
          resourceLoader.incrementWorkDone(1)
          resolve()
        },
        function (error) {
          reject(error)
        }
      )
    })
  }

  /**
   * Parses the contents of the loaded file
   * @param {string} fileData - The contents of the ASCII file we are loading.
   */
  parseData(fileData) {
    const lines = fileData.split('\n')
    const WHITESPACE_RE = /\s+/

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim()

      // Skip over comment lines
      if (line.startsWith('#')) continue

      // for each line, split it into elements.
      const elements = line.split(WHITESPACE_RE)
      const key = elements.shift()
      const value = elements.join(' ')
      switch (key) {
        case 'Foo':
          console.log(line)
          break
        case 'Bar':
          console.log(line)
          break
        default:
          console.log('Unhandled line', line)
        // console.warn("Unhandled material parameter: '" + key +"' in:" + filePath);
      }
    }
  }
}

export { MyCustomTreeItem }
