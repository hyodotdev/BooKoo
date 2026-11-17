import 'react-native';

import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {useMutation} from 'convex/react';
import {getFunctionName} from 'convex/server';
import {CpkProvider} from 'cpk-ui';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {api} from '@convex/_generated/api';
import type {Id} from '@convex/_generated/dataModel';
import {DISPLAY_NAME_MAX_LENGTH} from '@shared/profile';
import {ProfileEditScreen} from '../../../../src/features/release/screens';
import {uploadFile} from '../../../../src/features/media/upload';
import {theme} from '../../../../src/theme';
import {setActiveLocale} from '../../../../src/utils/i18n';

const updateProfile = jest.fn(() => Promise.resolve(null));
const generateUploadUrl = jest.fn(() => Promise.resolve('https://upload.test'));
const claimUpload = jest.fn(() => Promise.resolve(null));

jest.mock('../../../../src/features/auth/session', () => ({
  useSession: () => ({
    user: {
      avatar: null,
      bio: 'One calm shared ledger.',
      displayName: '민지',
      preferredCurrency: 'KRW',
    },
  }),
}));
jest.mock('../../../../src/features/media/upload', () => ({
  uploadFile: jest.fn(() => Promise.resolve('storage-avatar')),
}));
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({
      canceled: false,
      assets: [{uri: 'file:///avatar-camera.jpg'}],
    }),
  ),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({
      canceled: false,
      assets: [{uri: 'file:///avatar-original.jpg'}],
    }),
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true}),
  ),
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true}),
  ),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {JPEG: 'jpeg'},
  manipulateAsync: jest.fn(() =>
    Promise.resolve({height: 512, uri: 'file:///avatar-512.jpg', width: 512}),
  ),
}));

function mutationMock<T>(
  implementation: (...args: unknown[]) => Promise<T>,
): ReturnType<typeof useMutation> {
  const mutation = async (...args: unknown[]) => implementation(...args);
  mutation.withOptimisticUpdate = () => mutation;
  return mutation;
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 390, height: 844},
        insets: {top: 47, left: 0, right: 0, bottom: 34},
      }}
    >
      <CpkProvider
        themeConfig={{customTheme: theme, initialThemeType: 'light'}}
      >
        <ProfileEditScreen />
      </CpkProvider>
    </SafeAreaProvider>,
  );
}

describe('profile edit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocale('en');
    jest.mocked(useMutation).mockImplementation((reference) => {
      switch (getFunctionName(reference)) {
        case getFunctionName(api.user.mutations.updateProfile):
          return mutationMock(updateProfile);
        case getFunctionName(api.files.mutations.generateUploadUrl):
          return mutationMock(generateUploadUrl);
        case getFunctionName(api.files.mutations.claimUpload):
          return mutationMock(claimUpload);
        default:
          return mutationMock(() => Promise.resolve(null));
      }
    });
  });

  it('does not repeat the name prompt above the field', () => {
    const screen = renderScreen();
    expect(screen.queryByText('Your name.')).toBeNull();
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('saves a blank name because the ID is the required identity', async () => {
    const screen = renderScreen();
    fireEvent.changeText(screen.getByLabelText('Name'), '');
    fireEvent.press(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({displayName: ''}),
      ),
    );
  });

  it('crops, compresses, claims, previews and saves an owned avatar', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('profile-avatar-picker'));

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({allowsEditing: true, aspect: [1, 1]}),
      );
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file:///avatar-original.jpg',
        [{resize: {height: 512, width: 512}}],
        expect.objectContaining({compress: 0.84}),
      );
      expect(uploadFile).toHaveBeenCalledWith(
        'https://upload.test',
        'file:///avatar-512.jpg',
        'image/jpeg',
      );
      expect(claimUpload).toHaveBeenCalledWith({
        purpose: 'AVATAR',
        storageId: 'storage-avatar' as Id<'_storage'>,
        variant: 'AVATAR',
      });
    });

    fireEvent.press(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarStorageId: 'storage-avatar',
          displayName: '민지',
        }),
      ),
    );
  });

  it('enforces the same 30-character display-name rule before saving', () => {
    const screen = renderScreen();

    fireEvent.changeText(
      screen.getByLabelText('Name'),
      'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1),
    );

    expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
    expect(
      screen.getByText(
        'Leave blank for a generated name, or use at most 30 characters.',
      ),
    ).toBeTruthy();
  });

  it('opens the camera from the camera badge and the gallery from the avatar', async () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('profile-avatar-camera'));
    await waitFor(() =>
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalled(),
    );
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('profile-avatar-picker'));
    await waitFor(() =>
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled(),
    );
  });
});
