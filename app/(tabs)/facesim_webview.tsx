import React, { useRef } from "react";
import { Alert, Platform, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { printImage } from "../../controllers/facesim_controller";

/** Set this to your hosted page (Gradio/Next/etc) */
const HOST_URL = "https://facial-sim.onrender.com";

/** Set to true to use a built-in local HTML page (no server) */
const USE_EMBED = false;

const EMBED_HTML = `
<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { margin:0; font-family: system-ui, sans-serif; }
  .wrap { padding: 12px; }
  #print-area { display:flex; gap:12px; justify-content:center; }
  #print-area img { width:46vw; height:auto; border:1px solid #ccc; }
  @media print {
    body * { visibility:hidden!important }
    #print-area, #print-area * { visibility:visible!important }
    #print-area { position:fixed; inset:0; padding:0; }
    #print-area img { width:48vw; height:auto; }
  }
</style></head>
<body>
  <div class="wrap">
    <h3>FaceSim demo (embedded)</h3>
    <input id="file" type="file" accept="image/*" />
    <button id="gen">Generate (duplicate demo)</button>
    <button id="print-btn">🖨️ Print</button>
    <div id="print-area"></div>
  </div>
  <script>
    const rn = window.ReactNativeWebView;
    function post(o){ try{ rn.postMessage(JSON.stringify(o)); }catch(e){} }
    const file = document.getElementById('file');
    const gen = document.getElementById('gen');
    const area = document.getElementById('print-area');
    const btn = document.getElementById('print-btn');

    let lastDataUrl = null;

    gen.onclick = async () => {
      if (!file.files || !file.files[0]) { alert('Pick an image first'); return; }
      const f = file.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result; // data URL
        // Demo: original + duplicate (no droop). Replace with your real page later.
        area.innerHTML = '';
        const left = new Image(); left.src = src;
        const right = new Image(); right.src = src;
        area.append(left, right);
        lastDataUrl = src;
        post({ type: 'report-ready', src });
      };
      reader.readAsDataURL(f);
    };

    btn.onclick = (e) => {
      e.preventDefault();
      const img = area.querySelector('img');
      post({ type: 'print-request', src: img ? img.src : lastDataUrl });
    };

    post({ type: 'bridge-ready' });
  </script>
</body></html>
`;

export default function FaceSimWebView() {
  const ref = useRef<WebView | null>(null);
  let isPrinting = false;

  const injectedJS = !USE_EMBED ? `
    (function() {
      function post(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o))}catch(e){}}
      window.print = function(){
        var img=document.querySelector('#print-area img');
        post({type:'print-request', src: img ? img.src : null});
      };
      var btn = document.querySelector('#print-btn');
      if (btn) btn.onclick = function(e){ e.preventDefault(); window.print(); };
      post({type:'bridge-ready'});
    })();
    true;
  ` : undefined;

  async function onMessage(e: WebViewMessageEvent) {
    let msg: any = null;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg?.type === "print-request") {
      if (isPrinting) return;
      const src = msg.src;
      if (!src) return Alert.alert("No report", "Generate the report first.");
      isPrinting = true;
      await printImage(src);
      setTimeout(() => (isPrinting = false), 1200);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.title}>FaceSim — WebView</Text></View>
      <WebView
        ref={ref}
        source={USE_EMBED ? { html: EMBED_HTML } : { uri: HOST_URL }}
        injectedJavaScript={USE_EMBED ? undefined : injectedJS}
        onMessage={onMessage}
        javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback mixedContentMode="always"
        startInLoadingState style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
  header: { padding: 12, borderBottomWidth: 1, borderColor: "#ddd" },
  title: { fontSize: 18, fontWeight: "700" },
});
