import { shaderLibrary } from '@zeainc/zea-engine'

shaderLibrary.setShaderModule(
  'MyCustomGLSLHelpers.glsl',
  `

  const float MarchDumping = 0.7579;
  const float Far = 38.925;
  const int MaxSteps = 128;
  
  
  /////////////////////////////////////////
  
  
  const float TunnelSmoothFactor = 1.0;
  const float TunnelRadius = 0.85660005;
  const float TunnelFreqA = 0.18003;
  const float TunnelFreqB = 0.25;
  const float TunnelAmpA = 3.6230998;
  const float TunnelAmpB = 2.4324;
  const float NoiseIsoline = 0.319;
  const float NoiseScale = 0.4;
  
  #define M_NONE -1.0
  #define M_NOISE 1.0
  
  float hash(float h) {
    return fract(sin(h) * 43758.5453123);
  }
  
  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
  
    float n = p.x + p.y * 157.0 + 113.0 * p.z;
    return mix(
        mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
            mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y),
        mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
            mix(hash(n + 270.0), hash(n + 271.0), f.x), f.y), f.z);
  }
  
  float fbm(vec3 p) {
    float f = 0.0;
    f = 0.5000 * noise(p);
    p *= 2.01;
    f += 0.2500 * noise(p);
    p *= 2.02;
    f += 0.1250 * noise(p);
  
    return f;
  }
  
  // by iq. http://iquilezles.org/www/articles/smin/smin.htm
  float smax(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(a, b, h) + k * h * (1.0 - h);
  }
  
  // From "Subterranean Fly-Through" by Shane https://www.shadertoy.com/view/XlXXWj
  vec2 path(float z) {
    return vec2(TunnelAmpA * sin(z * TunnelFreqA), TunnelAmpB * cos(z * TunnelFreqB));
  }
  
  float noiseDist(vec3 p) {
    p = p / NoiseScale;
    return (fbm(p) - NoiseIsoline) * NoiseScale;
  }
  
  /////////////////////////////////////////
  // Raymarching
  //------------------------------------------------------------------
  float sdSphere( vec3 p, float s )
  {
    return length(p)-s;
  }
  float sdPlane( vec3 p, vec3 n, float d )
  {
    return dot(p, n) - d;
  }
  float sdCapsule( vec3 p, vec3 a, vec3 b, float r )
  {
    vec3 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return length( pa - ba*h ) - r;
  }
  float sdBox( vec3 p, vec3 b )
  {
    vec3 d = abs(p) - b;
    return length(max(d,0.0))
           + min(max(d.x,max(d.y,d.z)),0.0); // remove this line for an only partially signed sdf 
  }
  //------------------------------------------------------------------
  vec2 opU( vec2 d1, vec2 d2 )
  {
    return (d1.x<d2.x) ? d1 : d2;
  }
  vec2 opS( vec2 d1, vec2 d2 )
  {
    return (d1.x>d2.x) ? d1 : d2;
  }
  //------------------------------------------------------------------
  //#define ZERO (min(iFrame,0))
  #define ZERO 0
  //------------------------------------------------------------------
  vec2 map( in vec3 p )
  {
    float d = noiseDist(p);
    float d2 = length(p.xy - path(p.z)) - TunnelRadius;
    d = smax(d, -d2, TunnelSmoothFactor);
  
    vec2 res = vec2(d, M_NOISE);
    
    res = opS( res, vec2( sdSphere( p - v_bboxPos, 1.0 ), 26.0 ));

    // Union with the cutting plane.
    if (isCutawayEnabled != 0) {
      res = opS( res, vec2( sdPlane( p, cutAwayVector, cutDist ), res.y ));
    }

    return res;
  }
  
  vec2 castRay(vec3 ro, vec3 rd) {
    float tmin = 0.0;
    float tmax = Far;
  
    float precis = 0.002;
    float t = tmin;
    float m = M_NONE;
  
    for (int i = 0; i < MaxSteps; i++) {
      vec2 res = map(ro + rd * t);
      if (res.x < precis || t > tmax) {
        break;
      }
      t += res.x * MarchDumping;
      m = res.y;
    }
    if (t > tmax) {
      m = M_NONE;
    }
    return vec2(t, m);
  }
  
  float softshadow(vec3 ro, vec3 rd, float mint, float tmax) {
    float res = 1.0;
    float t = mint;
  
    for (int i = 0; i < 16; i++) {
      float h = map(ro + rd * t).x;
  
      res = min(res, 8.0 * h / t);
      t += clamp(h, 0.02, 0.10);
  
      if (h < 0.001 || t > tmax) {
        break;
      }
    }
    return clamp(res, 0.0, 1.0);
  }
  
  vec3 calcNormal(vec3 pos) {
    vec2 eps = vec2(0.001, 0.0);
  
    vec3 nor = vec3(map(pos + eps.xyy).x - map(pos - eps.xyy).x,
        map(pos + eps.yxy).x - map(pos - eps.yxy).x,
        map(pos + eps.yyx).x - map(pos - eps.yyx).x);
    return normalize(nor);
  }
  
  float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
  
    for (int i = 0; i < 5; i++) {
      float hr = 0.01 + 0.12 * float(i) / 4.0;
      vec3 aopos = nor * hr + pos;
      float dd = map(aopos).x;
  
      occ += -(dd - hr) * sca;
      sca *= 0.95;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
  }
  
  
  
`
)
