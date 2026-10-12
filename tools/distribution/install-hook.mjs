import {execFileSync} from 'node:child_process';
let current='';try{current=execFileSync('git',['config','--get','core.hooksPath'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch(error){if(error.status!==1)throw error;}
if(current.trim()&&current.trim()!=='.githooks')throw Error('An existing hooksPath is configured. Integrate the Quaked hook there; it will not be replaced.');
execFileSync('git',['config','core.hooksPath','.githooks']);
console.log('Installed Quaked staged distribution pre-commit hook.');
