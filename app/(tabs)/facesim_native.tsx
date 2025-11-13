import AnimatedPlaceholder from "@/components/AnimatedPlaceholder";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { printImage } from "../../controllers/facesim_controller";

const SERVER_URL = "https://anuragjambhulkar-server-py.hf.space/simulate"; // ← fixed

export default function FaceSimNative() {
  const [busy, setBusy] = useState(false);
  const [reportB64, setReportB64] = useState<string | null>(null);

  // Track the last picked/captured local file so we can delete it from cache
  const lastLocalUriRef = useRef<string | null>(null);
  // Track an in-flight request so we can cancel it (and avoid state updates after unmount/reset)
  const controllerRef = useRef<AbortController | null>(null);
  const showPlaceholder = !busy && !reportB64;


  async function takePhoto() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("Permission", "Camera access required.");
      const res = await ImagePicker.launchCameraAsync({ quality: 1, base64: false });
      if (res.canceled || !res.assets?.length) return;
      await sendToServer(res.assets[0].uri);
    } catch (e: any) {
      Alert.alert("Camera error", e?.message ?? String(e));
    }
  }

  async function sendToServer(uri: string) {
    // Store the local file so we can clean it up later
    lastLocalUriRef.current = uri;

    // Clean any previous result to free memory before the next heavy op
    setReportB64(null);

    try {
      setBusy(true);

      const filename = uri.split("/").pop() || `photo_${Date.now()}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1].toLowerCase()}` : "image/jpeg";

      const form = new FormData();
      // @ts-ignore: React Native FormData file shape
      form.append("file", { uri, name: filename, type });

      controllerRef.current?.abort();
      controllerRef.current = new AbortController();

      const resp = await fetch(SERVER_URL, {
        method: "POST",
        body: form,
        signal: controllerRef.current.signal,
      });

      if (!resp.ok) {
        const txt = await safeText(resp);
        throw new Error(`Server ${resp.status}: ${txt}`);
      }

      const data = await safeJson(resp);
      if (!data?.image_base64 || typeof data.image_base64 !== "string") {
        throw new Error("No image returned from server.");
      }
      setReportB64(`data:image/png;base64,${data.image_base64}`);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // silent on reset
      Alert.alert("Simulation failed", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setReportB64(null);
    const uri = lastLocalUriRef.current;
    lastLocalUriRef.current = null;
    if (uri && uri.startsWith("file://")) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      {showPlaceholder && <AnimatedPlaceholder visible />}
      {reportB64 ? (
        <View style={{ alignItems: "center", marginTop: 14 }}>
          <Image source={{ uri: reportB64 }} style={styles.preview} />
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <TouchableOpacity style={styles.action} onPress={() => printImage(reportB64!)}>
              <Text style={styles.actionText}>Print</Text>
            </TouchableOpacity>
            <View style={{ width: 12 }} />
            <TouchableOpacity style={[styles.action, styles.reset]} onPress={resetAll}>
              <Text style={styles.actionText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={{ textAlign: "center", marginTop: 20 }}>
          Pick or capture an image to generate the report.
        </Text>
      )}
      {busy && <ActivityIndicator style={{ marginTop: 12 }} />}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.btn} onPress={takePhoto} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Processing..." : "Take Photo"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/** Helpers that won’t blow up if response body was already consumed or not JSON */
async function safeText(resp: Response) {
  try {
    return await resp.text();
  } catch {
    return "<no body>";
  }
}
async function safeJson(resp: Response) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
  header: { padding: 12, borderBottomWidth: 1, borderColor: "#ddd", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 14, paddingHorizontal: 12 },
  btn: { flexGrow: 1, backgroundColor: "#0A7", padding: 14, borderRadius: 10 },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  preview: { width: 320, height: 420, resizeMode: "contain", borderWidth: 1, borderColor: "#ccc", borderRadius: 8 },
  action: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#007bff", borderRadius: 8 },
  actionText: { color: "#fff", fontWeight: "600" },
  reset: { backgroundColor: "#c62828" }, // red-ish
  bottomBar: { marginTop: "auto", padding: 12, flexDirection: "row", justifyContent: "center" },
  placeholderWrap: {
    alignItems: "center",
    marginTop: 30,
    marginHorizontal: 24,
  },

  pulseCircle: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 140,
    backgroundColor: "#E8FFF4",
    zIndex: 0,
  },

  placeholderCard: {
    width: "100%",
    maxWidth: 420,
    padding: 18,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
    zIndex: 1,
  },

  illustration: {
    marginBottom: 12,
  },

  illustrationBox: {
    width: 88,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#f0f7ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dceefe",
  },

  illustrationLens: {
    width: 28,
    height: 28,
    borderRadius: 28,
    backgroundColor: "#cce7ff",
    borderWidth: 2,
    borderColor: "#a7d4ff",
  },

  placeholderTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },

  placeholderHint: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },

  hintDots: {
    marginTop: 10,
    fontSize: 13,
    color: "#0A7",
    fontWeight: "700",
  },

});
