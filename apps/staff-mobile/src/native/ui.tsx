import React from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type TextInputProps, type ViewStyle } from "react-native";
import { Text, TextInput } from "./typography";
import { imageUrl } from "./client";
export const C = {
  bg: "#FCF8F3",
  paper: "#FFFFFF",
  ink: "#292333",
  sub: "#716978",
  brand: "#803C55",
  dark: "#35283E",
  pink: "#F3E4EA",
  peach: "#F8DFCA",
  mint: "#E5EFE5",
  green: "#386C51",
  line: "#EAE4E0",
  red: "#A13541",
  gold: "#835620",
};
export const pressFeedback: ViewStyle = {opacity: 0.82, transform: [{scale: 0.98}]};
export const T = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 29, fontWeight: "800", color: C.ink, letterSpacing: -1 },
  h2: { fontSize: 19, fontWeight: "800", color: C.ink, letterSpacing: -0.3 },
  h3: { fontSize: 15, fontWeight: "700", color: C.ink },
  body: { fontSize: 14, lineHeight: 21, color: C.ink },
  sub: { fontSize: 12, lineHeight: 19, color: C.sub },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: C.brand,
  },
  card: {
    backgroundColor: C.paper,
    borderRadius: 20,
    padding: 15,
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.paper,
    fontSize: 15,
    color: C.ink,
  },
  divider: { height: 1, backgroundColor: C.line },
  pill: {
    borderRadius: 12,
    backgroundColor: C.pink,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  error: {
    color: C.red,
    backgroundColor: "#FCEDEE",
    padding: 13,
    borderRadius: 13,
    fontSize: 13,
    lineHeight: 20,
  },
  empty: { paddingVertical: 35, alignItems: "center", gap: 10 },
  link: { fontSize: 13, fontWeight: "800", color: C.brand },
  button: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#71334B",
    shadowColor: "#803C55",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: {width:0,height:4},
    elevation: 2,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: { fontSize: 14, fontWeight: "800", color: "#FFF",flexShrink:1,textAlign:'center' },
  ghost: { backgroundColor: C.pink, borderColor: "#E7D2DC", shadowOpacity: 0, elevation: 0 },
  ghostText: { color: C.brand },
  disabled: { opacity: 0.45 },
  sheet: {
    flex: 1,
    ...(Platform.OS==='web'?{width:'100%' as const,maxWidth:480,alignSelf:'center' as const}:{}),
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "ios" ? 55 : 24,
  },
  sheetHead: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  close: {
    height: 45,
    width: 45,
    borderRadius: 16,
    backgroundColor: C.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  tiny: { fontSize: 11, color: C.sub },
});
export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  kind = "main",
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  kind?: "main" | "ghost" | "danger";
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: busy || disabled, busy}}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        T.button,
        kind === "ghost" && T.ghost,
        kind === "danger" && { backgroundColor: C.red },
        (busy || disabled) && T.disabled,
        pressed && pressFeedback,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === "ghost" ? C.brand : "#FFF"} />
      ) : (
        <Text style={[T.buttonText, kind === "ghost" && T.ghostText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={T.h3}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#A39AA5"
        {...props}
        style={[
          T.input,
          props.multiline && { minHeight: 95, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({pressed}) => [
        T.pill,
        { minHeight: 44, justifyContent: "center" },
        selected
          ? { backgroundColor: C.dark }
          : { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
        pressed && pressFeedback,
      ]}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: selected ? "#FFF" : C.sub,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Photo({
  uri,
  label,
  size = 60,
}: {
  uri?: string;
  label: string;
  size?: number;
}) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [uri]);
  return uri && !failed ? (
    <Image
      accessibilityLabel={label}
      source={{ uri: imageUrl(uri) }}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: C.pink,
      }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: C.peach,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: C.brand, fontSize: size * 0.4, fontWeight: "800" }}>
        {label.slice(0, 1)}
      </Text>
    </View>
  );
}
export function BrandLogo({uri,size=48}:{uri?:string;size?:number}){
  const [failed,setFailed]=React.useState(false);
  React.useEffect(()=>setFailed(false),[uri]);
  const live=imageUrl(uri);
  return <Image accessibilityLabel="Aurora’s Cake logo" source={live&&!failed?{uri:live}:require('../../assets/icon.png')} onError={()=>setFailed(true)} resizeMode="contain" style={{width:size,height:size,flexShrink:0,borderRadius:size*.2}}/>;
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={T.empty}>
      <Text style={{ fontSize: 31, color: C.brand }}>✧</Text>
      <Text style={T.h3}>{title}</Text>
      <Text style={[T.sub, { textAlign: "center", maxWidth: 270 }]}>
        {detail}
      </Text>
    </View>
  );
}
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={T.sheet}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={T.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={T.h2}>{title}</Text>
            {subtitle && <Text style={T.sub}>{subtitle}</Text>}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close screen"
            onPress={onClose}
            style={T.close}
          >
            <Text style={{ fontSize: 23, color: C.ink }}>×</Text>
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={T.content}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
        {footer && (
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 13,
              paddingBottom: Platform.OS === "ios" ? 30 : 18,
              borderTopWidth: 1,
              borderColor: C.line,
              backgroundColor: C.paper,
            }}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
