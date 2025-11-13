import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FaceSimNative from "./facesim_native";
import FaceSimWebView from "./facesim_webview";

const Tabs = createBottomTabNavigator();

export default function AppTabs() {
  const insets = useSafeAreaInsets();

  // base height of tab bar; we add bottom safe area inset so it never overlaps nav gestures
  const TAB_BAR_HEIGHT = 64 + Math.max(insets.bottom, Platform.OS === "android" ? 8 : 12);

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0A7",
        tabBarInactiveTintColor: "#666",
        tabBarStyle: {
          height: TAB_BAR_HEIGHT,
          paddingBottom: Math.max(insets.bottom, 10), // ensure safe gap for gesture nav / home indicator
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: "#e6e6e6",
          backgroundColor: "#fff",
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: -2 },
        },
        tabBarItemStyle: {
          marginHorizontal: 6, // prevent items touching each other
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
        // ensure icon size isn't huge and has its own hit-area container
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="facesim_native"
        component={FaceSimNative}
        options={{
          title: "FaceSim (Native)",
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
              <MaterialCommunityIcons
                name={focused ? "account-circle" : "account-circle-outline"}
                size={20} // slightly smaller for comfortable spacing
                color={color}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="facesim_webview"
        component={FaceSimWebView}
        options={{
          title: "FaceSim (WebView)",
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{ alignItems: "center", justifyContent: "center", width: 44 }}>
              <Ionicons
                name={focused ? "globe" : "globe-outline"}
                size={20}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs.Navigator>
  );
}
