// app/_layout.tsx
import { Stack } from "expo-router";
import React from "react";
import "react-native-reanimated";

/**
 * Root layout for the app.
 * Keep the anchor so the (tabs) route group is treated as primary.
 */
export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
