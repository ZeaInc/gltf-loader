import { GLShader, shaderLibrary } from '@zeainc/zea-engine'

/** Class representing a GL draw trim curve strips shader.
 * @extends GLShader
 * @ignore
 */
class MyCustomRenderShader extends GLShader {
  /**
   * Create a GL draw trim curve strips shader.
   * @param {any} gl - The gl value.
   */
  constructor(gl) {
    super(gl)

    this.setShaderStage(
      'VERTEX_SHADER',
      `
precision highp float;

attribute vec4 positions;

uniform vec3 boxSize;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;


/* VS Outputs */
varying vec3 v_worldPos;
varying vec3 v_bboxPos;
varying vec3 v_viewPos;

void main(void) {
  mat4 modelViewMatrix = viewMatrix * modelMatrix;
  vec4 pos = positions * vec4(boxSize, 1.0);

  vec4 viewPos    = modelViewMatrix * pos;
  v_viewPos       = -viewPos.xyz;
  
  v_worldPos = (modelMatrix * pos).xyz;
  v_bboxPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position     = projectionMatrix * viewPos;
}
`
    )

    this.setShaderStage(
      'FRAGMENT_SHADER',
      `
precision highp float;

uniform vec3 boxSize;
uniform mat4 viewMatrix;
uniform mat4 cameraMatrix;
uniform mat4 projectionMatrix;

uniform int isCutawayEnabled;
uniform vec3 cutAwayVector;
uniform float cutDist;

#if defined(DRAW_COLOR)
uniform vec4 color;
uniform float metallic;
uniform float roughness;
uniform float reflectance;
#elif defined(DRAW_GEOMDATA)
uniform int passId;
uniform int itemId;
#elif defined(DRAW_HIGHLIGHT)
uniform vec4 highlightColor;
#endif

/* VS Outputs */
varying vec3 v_worldPos;
varying vec3 v_bboxPos;
varying vec3 v_viewPos;


<%include file="GLSLUtils.glsl"/>
<%include file="MyCustomGLSLHelpers.glsl"/>
<%include file="stack-gl/gamma.glsl"/>
<%include file="PBRSurfaceRadiance.glsl"/>

vec4 render(vec3 ro, vec3 rd) {
  vec2 res = castRay(ro, rd);
  float t = res.x;
  float m = res.y;

  if (m > -0.5) {
    vec3 pos = ro + t * rd;
#if defined(DRAW_COLOR)

    vec3 nor = calcNormal(pos);
    
    vec3 viewVector = normalize(mat3(cameraMatrix) * normalize(v_viewPos));
    
    MaterialParams material;
    material.baseColor     = toLinear(color.rgb);
    material.metallic      = metallic;
    material.roughness     = roughness;
    material.reflectance   = reflectance;

    material.emission         = 0.0;
    material.opacity          = 1.0;
    vec4 radiance = pbrSurfaceRadiance(material, nor, viewVector);
    
    return vec4(vec3(clamp(radiance.rgb, 0.0, 1.0)), t);
#else
    return vec4(vec3(0.0), t);
#endif
  }
  
  return vec4(vec3(0.0), -1.0);
}


out vec4 fragColor;

void main(void) {

  vec3 camPos = vec3(cameraMatrix[3][0], cameraMatrix[3][1], cameraMatrix[3][2]);
  vec3 ro = v_worldPos;
  if (!gl_FrontFacing) {
    ro = camPos;
  }
  vec3 rd = normalize(v_worldPos - camPos);
  
  // ray march 
  vec4 res = render( ro, rd );
  float t = res.a;
  if(t < 0.0) {
    discard;
    return;
  }

  // Calculate frag depth
  vec4 fragPos = vec4(ro + t * rd, 1.0);


  float far=gl_DepthRange.far; float near=gl_DepthRange.near;
  vec4 eye_space_pos = viewMatrix * fragPos;
  vec4 clip_space_pos = projectionMatrix * eye_space_pos;
  
  float ndc_depth = clip_space_pos.z / clip_space_pos.w;
  float depth = (((far-near) * ndc_depth) + near + far) / 2.0;
  gl_FragDepth = depth;

  // the shader can be compiled in 3 different modes. 
  // In 'DRAW_COLOR' mode the final pixel color is output to the fragment.
#if defined(DRAW_COLOR)

  // gamma
  vec3 col = pow( res.rgb, vec3(0.4545) );
  fragColor = vec4( col, 1.0 );
  
#elif defined(DRAW_GEOMDATA)
  // The Geom Data buffer is an offscreen buffer that stores identifying 
  // information in each pixel for the geometry rasterized to that pixel.
  // The Viewport queries this buffer to detect pointer interactions. 
  // The red channel stores the pass id, which tells the Viewport which 
  // pass to call  getGeomItemAndDist.
  // The pass can decide what to pack in the other 3 pixels to identify 
  // the drawn geometry, and also the distance to the rendered fragment.
  fragColor.r = float(passId); 
  fragColor.g = float(itemId);
  fragColor.b = 0.0;// spare: store some other useful data
  fragColor.a = length(camPos - fragPos.xyz);
#elif defined(DRAW_HIGHLIGHT)

  fragColor = highlightColor;

#endif
}
`
    )
  }

  /**
   * The bind method.
   * @param {object} renderstate - The object tracking the current state of the renderer
   * @param {string} key - The key value.
   */
  bind(renderstate, key) {
    super.bind(renderstate, key)

    const gl = this.__gl
    if (renderstate.envMap) {
      renderstate.envMap.bind(renderstate)
    }

    const { exposure } = renderstate.unifs
    if (exposure) {
      gl.uniform1f(exposure.location, renderstate.exposure)
    }
  }
}

export { MyCustomRenderShader }
