import {connectObs} from './demo-obs.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const obs=await connectObs(),sceneName='Academic Editor Ultra · 1080p',inputName='Prepared desktop area';
try{
  if((await obs.call('GetRecordStatus')).outputActive)throw Error('Stop recording before reconfiguring');
  for(const input of (await obs.call('GetInputList')).inputs)if(input.inputKind.startsWith('wasapi_'))await obs.call('SetInputMute',{inputName:input.inputName,inputMuted:true});
  if(!(await obs.call('GetSceneList')).scenes.some(s=>s.sceneName===sceneName))await obs.call('CreateScene',{sceneName});
  if(!(await obs.call('GetInputList')).inputs.some(s=>s.inputName===inputName))await obs.call('CreateInput',{sceneName,inputName,inputKind:'monitor_capture',inputSettings:{capture_cursor:true},sceneItemEnabled:true});
  const monitors=await obs.call('GetInputPropertiesListPropertyItems',{inputName,propertyName:'monitor_id'});
  console.log('Monitors',monitors.propertyItems);
  const monitor=monitors.propertyItems.find(i=>i.itemEnabled&&/\(0, ?0\)/.test(i.itemName))??monitors.propertyItems.find(i=>i.itemEnabled);
  if(!monitor)throw Error('No monitor is available');
  await obs.call('SetInputSettings',{inputName,inputSettings:{monitor_id:monitor.itemValue,capture_cursor:true}});
  await obs.call('SetCurrentProgramScene',{sceneName});
  await obs.call('SetVideoSettings',{baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080,fpsNumerator:30,fpsDenominator:1});
  const {sceneItemId}=await obs.call('GetSceneItemId',{sceneName,sourceName:inputName});
  let t;for(let i=0;i<30;i++){({sceneItemTransform:t}=await obs.call('GetSceneItemTransform',{sceneName,sceneItemId}));if(t.sourceWidth)break;await new Promise(r=>setTimeout(r,100));}
  console.log('Source pixels',t.sourceWidth,t.sourceHeight);
  if(t.sourceWidth!==3440||t.sourceHeight!==1440)throw Error('Expected the prepared 3440×1440 monitor; update capture coordinates for this machine');
  await obs.call('SetSceneItemTransform',{sceneName,sceneItemId,sceneItemTransform:{positionX:0,positionY:0,scaleX:1,scaleY:1,alignment:5,cropLeft:760,cropRight:760,cropTop:180,cropBottom:180}});
  const directory=path.resolve('test-artifacts/launch-media/raw');await fs.mkdir(directory,{recursive:true});
  await obs.call('SetRecordDirectory',{recordDirectory:directory});
  for(const [parameterCategory,parameterName,parameterValue] of [['Output','Mode','Simple'],['SimpleOutput','RecQuality','HQ'],['SimpleOutput','RecEncoder','x264'],['SimpleOutput','RecFormat2','mkv']])await obs.call('SetProfileParameter',{parameterCategory,parameterName,parameterValue});
  await obs.call('SaveSourceScreenshot',{sourceName:sceneName,imageFormat:'png',imageFilePath:path.resolve('test-artifacts/launch-media/stage.png')});
  console.log('Ready: 1920×1080, 30 fps, MKV, muted desktop and microphone.');
}finally{obs.close();}
