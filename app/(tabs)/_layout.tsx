// app/(tabs)/_layout.tsx
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  // base extra bottom padding for gesture/navigation area on Android
  const safeBottom = Math.max(insets.bottom, Platform.OS === "android" ? 14 : 18);

  // tab bar height: base + safe bottom
  const BASE_TAB_HEIGHT = 56; // comfortable base
  const tabBarHeight = BASE_TAB_HEIGHT + safeBottom;

  return (
    <Tabs
      initialRouteName="facesim_native"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0A7",
        tabBarInactiveTintColor: "#666",
        tabBarStyle: {
          height: tabBarHeight,
          paddingBottom: safeBottom,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: "#e6e6e6",
          backgroundColor: "#ffffff", // solid background to visually separate from nav bar
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: -2 },
          shadowRadius: 10,
        },
        tabBarLabelStyle: { fontSize: 12, paddingBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="facesim_native"
        options={{
          title: "FaceSim (Native)",
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "account-circle" : "account-circle-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="facesim_webview"
        options={{
          title: "FaceSim (WebView)",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "globe" : "globe-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
