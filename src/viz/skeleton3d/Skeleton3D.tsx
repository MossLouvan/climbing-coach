import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import * as THREE from 'three';

import { JOINT_INDEX, SKELETON_BONES, type Pose3D } from '@domain/models';

import { colors } from '../../app/theme/tokens';

/**
 * 3D stick skeleton + stylized body-capsule mesh.
 *
 * Design goals for V1:
 *   - the stick skeleton is REAL: each bone is a line segment between
 *     two 3D joint positions. Updating `pose` immediately redraws it.
 *   - the body mesh is a STYLIZED APPROXIMATION: we place capsule
 *     primitives along each limb and a torso box. It is NOT a real
 *     SMPL fit. It's intentionally simple and clearly documented as
 *     "approximated" — upgrading to a real parametric mesh is a
 *     localized change in this file.
 *
 * Rendering uses expo-gl + three. We don't pull in @react-three/fiber
 * to keep the dependency surface minimal for Expo Go compatibility.
 *
 * The scene is kept in a ref and mutated in place between frames to
 * avoid GC pressure.
 */
export interface Skeleton3DProps {
  readonly pose: Pose3D | null;
  readonly showMesh?: boolean;
  readonly autoRotate?: boolean;
}

export function Skeleton3D({
  pose,
  showMesh = true,
  autoRotate = false,
}: Skeleton3DProps): React.ReactElement {
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: Renderer;
    bones: THREE.Line[];
    joints: THREE.Mesh[];
    limbs: THREE.Mesh[];
    torso: THREE.Mesh;
    disposed: boolean;
    rotation: number;
  } | null>(null);

  const onContextCreate = useCallback(
    async (gl: WebGLRenderingContext) => {
      const width = (gl as unknown as { drawingBufferWidth: number }).drawingBufferWidth;
      const height = (gl as unknown as { drawingBufferHeight: number }).drawingBufferHeight;
      const renderer = new Renderer({ gl });
      renderer.setSize(width, height);
      renderer.setClearColor(new THREE.Color(colors.bg), 1);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 50);
      camera.position.set(0, 0.2, 2.8);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0x888888, 0.9));
      const dir = new THREE.DirectionalLight(0xffffff, 0.6);
      dir.position.set(1, 1, 2);
      scene.add(dir);

      // Wall plane behind the climber for context.
      const wallMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.bgElevated),
        side: THREE.DoubleSide,
      });
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), wallMat);
      wall.position.set(0, 0, -0.1);
      scene.add(wall);

      const bones: THREE.Line[] = [];
      const jointMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.accent),
      });
      const joints: THREE.Mesh[] = [];
      for (let i = 0; i < 17; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), jointMat);
        scene.add(m);
        joints.push(m);
      }
      const boneMat = new THREE.LineBasicMaterial({ color: new THREE.Color(colors.text) });
      for (let i = 0; i < SKELETON_BONES.length; i++) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
        ]);
        const line = new THREE.Line(geom, boneMat);
        scene.add(line);
        bones.push(line);
      }

      // Stylized capsule-per-limb mesh — approximated body surface.
      // Disclosed in code: NOT real SMPL.
      const limbMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.boneLeft),
        transparent: true,
        opacity: 0.35,
      });
      const limbs: THREE.Mesh[] = [];
      for (let i = 0; i < SKELETON_BONES.length; i++) {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1, 10, 1, true),
          limbMat,
        );
        m.visible = false;
        scene.add(m);
        limbs.push(m);
      }
      const torsoMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.boneSpine),
        transparent: true,
        opacity: 0.25,
      });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.16), torsoMat);
      torso.visible = false;
      scene.add(torso);

      const ctx = {
        scene,
        camera,
        renderer,
        bones,
        joints,
        limbs,
        torso,
        disposed: false,
        rotation: 0,
      };
      sceneRef.current = ctx;

      const tick = () => {
        const c = sceneRef.current;
        if (!c || c.disposed) return;
        if (autoRotate) {
          c.rotation += 0.01;
          c.camera.position.x = Math.sin(c.rotation) * 2.8;
          c.camera.position.z = Math.cos(c.rotation) * 2.8;
          c.camera.lookAt(0, 0, 0);
        }
        c.renderer.render(c.scene, c.camera);
        (gl as unknown as { endFrameEXP: () => void }).endFrameEXP();
        requestAnimationFrame(tick);
      };
      tick();
    },
    [autoRotate],
  );

  useEffect(() => {
    const c = sceneRef.current;
    if (!c || !pose) return;
    const j = pose.joints;
    for (let i = 0; i < c.joints.length && i < j.length; i++) {
      c.joints[i].position.set(j[i].x, j[i].y, j[i].z);
    }
    for (let i = 0; i < SKELETON_BONES.length; i++) {
      const [a, b] = SKELETON_BONES[i];
      const ja = j[JOINT_INDEX[a]];
      const jb = j[JOINT_INDEX[b]];
      if (!ja || !jb) continue;
      const geom = c.bones[i].geometry as THREE.BufferGeometry;
      const pts = [
        new THREE.Vector3(ja.x, ja.y, ja.z),
        new THREE.Vector3(jb.x, jb.y, jb.z),
      ];
      geom.setFromPoints(pts);
      geom.attributes.position.needsUpdate = true;
      if (showMesh) {
        const limb = c.limbs[i];
        const mid = new THREE.Vector3().addVectors(pts[0], pts[1]).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(pts[1], pts[0]);
        const len = dir.length();
        limb.visible = len > 1e-3;
        limb.position.copy(mid);
        limb.scale.set(1, len, 1);
        limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      } else {
        c.limbs[i].visible = false;
      }
    }
    if (showMesh) {
      const midShoulder = midpoint(j, JOINT_INDEX.left_shoulder, JOINT_INDEX.right_shoulder);
      const midHip = midpoint(j, JOINT_INDEX.left_hip, JOINT_INDEX.right_hip);
      const mid = new THREE.Vector3().addVectors(midShoulder, midHip).multiplyScalar(0.5);
      const dy = midShoulder.y - midHip.y;
      c.torso.visible = true;
      c.torso.position.copy(mid);
      c.torso.scale.set(1, Math.abs(dy) / 0.4, 1);
    } else {
      c.torso.visible = false;
    }
  }, [pose, showMesh]);

  useEffect(
    () => () => {
      if (sceneRef.current) sceneRef.current.disposed = true;
    },
    [],
  );

  return (
    <View style={styles.root}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

function midpoint(j: Pose3D['joints'], a: number, b: number): THREE.Vector3 {
  return new THREE.Vector3(
    (j[a].x + j[b].x) / 2,
    (j[a].y + j[b].y) / 2,
    (j[a].z + j[b].z) / 2,
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
