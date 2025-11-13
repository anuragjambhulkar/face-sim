import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";

type Props = {
  /** Render the placeholder only when true (idle / before take photo). */
  visible?: boolean;
};

const { width: SCREEN_W } = Dimensions.get("window");

const AnimatedPlaceholder: React.FC<Props> = ({ visible = true }) => {
  // If not visible, render nothing (keeps tree small)
  if (!visible) return null;

  const pulse = useRef(new Animated.Value(0)).current; // 0..1 -> scale & opacity
  const floatY = useRef(new Animated.Value(0)).current; // 0..1 -> translateY
  const dots = useRef(new Animated.Value(0)).current; // cycles 0..2 numeric for opacity map
  const appear = useRef(new Animated.Value(0)).current; // 0..1 for entrance opacity/scale

  useEffect(() => {
    // Entrance animation
    Animated.timing(appear, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Pulse animation: scale and fade loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // Float animation (vertical subtle movement)
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );

    // Dots cycle: animate value 0->2 then loop
    const dotsLoop = Animated.loop(
      Animated.timing(dots, { toValue: 2, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    );

    pulseLoop.start();
    floatLoop.start();
    dotsLoop.start();

    // cleanup
    return () => {
      pulseLoop.stop();
      floatLoop.stop();
      dotsLoop.stop();
      appear.setValue(0);
      pulse.setValue(0);
      floatY.setValue(0);
      dots.setValue(0);
    };
  }, [appear, pulse, floatY, dots]);

  // Derived animated styles (pure numeric interpolations)
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.28, 0.12, 0.28] });

  const translateY = floatY.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  // three dot opacities (staggered)
  const dot1 = dots.interpolate({ inputRange: [0, 0.66, 1.33, 2], outputRange: [1, 0.4, 0.4, 1] });
  const dot2 = dots.interpolate({ inputRange: [0, 0.66, 1.33, 2], outputRange: [0.4, 1, 0.4, 0.4] });
  const dot3 = dots.interpolate({ inputRange: [0, 0.66, 1.33, 2], outputRange: [0.4, 0.4, 1, 0.4] });

  // entrance style
  const appearStyle = {
    opacity: appear,
    transform: [
      { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
    ],
  };

  // layer sizes tuned for phone/tablet balance
  const pulseSize = Math.min(320, SCREEN_W - 40);

  return (
    <Animated.View style={[styles.wrap, appearStyle]} accessibilityLiveRegion="polite" accessibilityRole="none">
      {/* Pulse circle behind card */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulse,
          {
            width: pulseSize,
            height: pulseSize,
            borderRadius: pulseSize / 2,
            transform: [{ scale: pulseScale }],
            opacity: pulseOpacity,
          },
        ]}
      />

      <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            {/* simple hospital/clinic mark: cross inside rounded bg */}
            <View style={styles.crossBg}>
              <View style={styles.crossVertical} />
              <View style={styles.crossHorizontal} />
            </View>
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.title}>Hospital Face Report</Text>
            <Text style={styles.subtitle}>Capture a clear face photo for clinical assessment</Text>
          </View>
        </View>

        {/* Illustration */}
        <View style={styles.illustrationWrap}>
          <View style={styles.illustrationCard}>
            <View style={styles.avatarCircle} />
            <View style={styles.avatarOverlay} />
          </View>
        </View>

        <Text style={styles.hint}>
          Tap <Text style={{ fontWeight: "700" }}>Take Photo</Text> to begin — try to position the face centered and well-lit.
        </Text>

        <View style={styles.dotsRow} accessible accessibilityRole="text" accessibilityLabel="Preparing">
          <Text style={styles.prep}>Preparing</Text>
          <Animated.Text style={[styles.dot, { opacity: dot1 }]}>.</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: dot2 }]}>.</Animated.Text>
          <Animated.Text style={[styles.dot, { opacity: dot3 }]}>.</Animated.Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

export default AnimatedPlaceholder;

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginTop: 28,
    marginHorizontal: 20,
  },

  // pulse - behind card
  pulse: {
    position: "absolute",
    backgroundColor: "#E9FDF7", // very calm teal
    zIndex: 0,
  },

  card: {
    width: "100%",
    maxWidth: 520,
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "flex-start",
    zIndex: 1,
    // soft hospital-like elevation
    shadowColor: "#004d40",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  logoBox: {
    marginRight: 12,
  },

  crossBg: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#E6FBF3",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1F6EA",
  },

  crossVertical: {
    position: "absolute",
    width: 8,
    height: 28,
    backgroundColor: "#00A67E",
    borderRadius: 2,
  },

  crossHorizontal: {
    position: "absolute",
    width: 28,
    height: 8,
    backgroundColor: "#00A67E",
    borderRadius: 2,
  },

  titleBlock: {
    flex: 1,
  },

  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#043027",
  },

  subtitle: {
    fontSize: 12,
    color: "#4c6b63",
    marginTop: 2,
  },

  illustrationWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    marginVertical: 12,
  },

  illustrationCard: {
    width: "92%",
    maxWidth: 420,
    height: 140,
    borderRadius: 10,
    backgroundColor: "#F6FDFA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EAF9F3",
  },

  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 72,
    backgroundColor: "#DFF8EE",
    borderWidth: 2,
    borderColor: "#BEEFD8",
  },

  avatarOverlay: {
    position: "absolute",
    bottom: 12,
    right: 18,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#00A67E",
    opacity: 0.9,
  },

  hint: {
    fontSize: 13,
    color: "#546e66",
    textAlign: "left",
    marginTop: 6,
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },

  prep: {
    marginRight: 8,
    fontSize: 13,
    color: "#007a5f",
    fontWeight: "700",
  },

  dot: {
    marginLeft: 2,
    fontSize: 18,
    color: "#007a5f",
    fontWeight: "700",
    lineHeight: 18,
  },
});
