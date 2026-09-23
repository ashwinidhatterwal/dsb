import fs from 'node:fs';

const html = fs.readFileSync('admin.html', 'utf8');
const js = fs.readFileSync('admin-image-editor.js', 'utf8');
const css = fs.readFileSync('admin-image-editor.css', 'utf8');
const admin = fs.readFileSync('admin.js', 'utf8');
const fail = msg => { throw new Error(msg); };

for (const asset of ['admin-image-editor.js', 'admin-image-editor.css']) {
  if (!html.includes(asset)) fail(`admin.html is missing ${asset}`);
}
for (const id of ['f-imagefile', 'f-extraimagefile']) {
  if (!html.includes(`id="${id}"`)) fail(`admin.html is missing ${id}`);
  if (!js.includes(id)) fail(`image editor is not wired to ${id}`);
}
for (const feature of ['Rotate left', 'Rotate right', '3:4', '4:3', 'Apply edit', 'formatBytes', 'createImageBitmap']) {
  if (!js.includes(feature)) fail(`image editor feature missing: ${feature}`);
}
if (!css.includes('.image-editor-dialog')) fail('image editor dialog styling is missing');
if (!admin.includes('async function uploadFileToCloudinary(file)')) fail('existing upload flow was unexpectedly removed');
if (!admin.includes('const upload = await resizeUpload(file)')) fail('existing upload optimization was unexpectedly removed');
console.log('Image editor integration check passed.');
