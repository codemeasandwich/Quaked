/** Node test filesystem access uses the same physical resource resolver as packaging. */
import * as fs from 'node:fs';
import {resourcePath} from './resource_path.mjs';
export * from 'node:fs';
export const readFileSync=(path,...args)=>fs.readFileSync(resourcePath(path),...args);
export const writeFileSync=(path,...args)=>fs.writeFileSync(resourcePath(path),...args);
export const existsSync=(path,...args)=>fs.existsSync(resourcePath(path),...args);
export const readdirSync=(path,...args)=>fs.readdirSync(resourcePath(path),...args);
export const statSync=(path,...args)=>fs.statSync(resourcePath(path),...args);
export const lstatSync=(path,...args)=>fs.lstatSync(resourcePath(path),...args);
export const openSync=(path,...args)=>fs.openSync(resourcePath(path),...args);
export const accessSync=(path,...args)=>fs.accessSync(resourcePath(path),...args);
export const createReadStream=(path,...args)=>fs.createReadStream(resourcePath(path),...args);
