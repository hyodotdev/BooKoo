import {Platform} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Android's system picker grants access only to the photos the user selects,
 * so requesting broad library access there is unnecessary and policy-hostile.
 * iOS retains its explicit Photos permission flow.
 */
export async function hasPhotoPickerAccess(): Promise<boolean> {
  if (Platform.OS === 'android') return true;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return permission.granted;
}

export async function hasCameraAccess(): Promise<boolean> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  return permission.granted;
}
