/** Async Node test filesystem access shares the packaging resource resolver. */
import * as fs from 'node:fs/promises';
import {resourcePath} from './resource_path.mjs';
export * from 'node:fs/promises';
export const readFile=(path,...args)=>fs.readFile(resourcePath(path),...args);
export const writeFile=(path,...args)=>fs.writeFile(resourcePath(path),...args);
export const readdir=(path,...args)=>fs.readdir(resourcePath(path),...args);
export const stat=(path,...args)=>fs.stat(resourcePath(path),...args);
export const lstat=(path,...args)=>fs.lstat(resourcePath(path),...args);
export const open=(path,...args)=>fs.open(resourcePath(path),...args);
export const access=(path,...args)=>fs.access(resourcePath(path),...args);
