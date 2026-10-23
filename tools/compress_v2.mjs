import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, simplifyPrimitive, quantize, meshopt, dedup, prune, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
const [, , inp, out, err = '0.0008'] = process.argv;
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const count = () => { let n = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += p.getAttribute('POSITION').getCount(); return n; };
console.log('verts in', count());
await doc.transform(weld());
const skip = new RegExp(process.env.SKIP || '^$');
for (const node of doc.getRoot().listNodes()) { const mesh = node.getMesh(); if (!mesh || skip.test(node.getName())) continue; for (const p of mesh.listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0, error: +err, lockBorder: true }); }
await doc.transform(dedup(), prune());
console.log('verts out', count());
if (!process.env.NOQ) await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: +(process.env.QN||10) }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);
