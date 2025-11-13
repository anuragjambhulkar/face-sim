import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

function getWritableDir(): string {
  const fs = FileSystem as unknown as { cacheDirectory?: string | null; documentDirectory?: string | null; };
  const dir = fs.cacheDirectory ?? fs.documentDirectory ?? null;
  if (!dir) throw new Error("No writable directory available on this platform.");
  return dir.endsWith("/") ? dir : dir + "/";
}
function getBase64Encoding(): any {
  const fsAny = FileSystem as unknown as { EncodingType?: { Base64?: any } };
  return fsAny.EncodingType?.Base64 ?? "base64";
}

export async function printImage(base64Uri: string) {
  if (!base64Uri) {
    return Alert.alert("No image", "Generate a report first.");
  }

  try {
    const html = `
      <html>
        <body style="margin:0;padding:0;">
          <img src="${base64Uri}"
              style="
                width:210mm;   /* A5 width */
                height:148mm;  /* A5 height */
                object-fit:contain;
              "
          />
        </body>
      </html>
    `;

    await Print.printAsync({
      html,
      orientation: Print.Orientation.landscape,  // ✅ Force landscape always
    });

  } catch (e: any) {
    Alert.alert("Print failed", e?.message ?? String(e));
  }
}

export async function shareImage(base64Uri: string) {
  if (!base64Uri) return Alert.alert("No image", "Generate a report first.");
  try {
    const base64 = base64Uri.includes(",") ? base64Uri.split(",")[1] : base64Uri;
    const filepath = `${getWritableDir()}facesim_report_${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(filepath, base64, { encoding: getBase64Encoding() } as any);
    const canShare = Platform.OS !== "web" && (await Sharing.isAvailableAsync());
    if (!canShare) return Alert.alert("Sharing not available on this platform.");
    await Sharing.shareAsync(filepath, { mimeType: "image/png" });
  } catch (e: any) { Alert.alert("Share failed", e?.message ?? String(e)); }
}
