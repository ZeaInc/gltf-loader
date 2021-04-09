import {
  Quat,
  NumberParameter,
  Vec3Parameter,
  Operator,
  OperatorInput,
  OperatorOutput,
  OperatorOutputMode,
  Registry,
  Vec3,
} from '@zeainc/zea-engine'

/** An operator for aiming items at targets.
 * @extends Operator
 */
class MyCustomOperator extends Operator {
  /**
   * Create a gears operator.
   * @param {string} name - The name value.
   */
  constructor(name) {
    super(name)

    this.addParameter(new NumberParameter('Angle', 1))
    this.addParameter(new Vec3Parameter('Axis', new Vec3(1, 0, 0)))
    this.addInput(new OperatorInput('Space'))
    this.addOutput(new OperatorOutput('Xfo', OperatorOutputMode.OP_READ_WRITE))
  }

  /**
   * The evaluate method.
   */
  evaluate() {
    const output = this.getOutput('Xfo')
    const xfo = output.getValue()

    const spaceInput = this.getInput('Space')
    if (spaceInput.isConnected()) {
      const space = spaceInput.getValue()
      const angle = this.getParameter('Angle').getValue()
      const rotation = new Quat()
      rotation.setFromAxisAndAngle(space.ori.getZaxis(), angle)
      xfo.ori = rotation.multiply(xfo.ori)
      output.setClean(xfo)
    } else {
      const angle = this.getParameter('Angle').getValue()
      const axis = this.getParameter('Axis').getValue()
      const rotation = new Quat()
      rotation.setFromAxisAndAngle(axis.normalize(), angle)
      xfo.ori = rotation.multiply(xfo.ori)
      output.setClean(xfo)
    }
  }
}

// Now make sure to register the custom class with the registry so that factory methods know how to construct it.
Registry.register('MyCustomOperator', MyCustomOperator)

export { MyCustomOperator }
