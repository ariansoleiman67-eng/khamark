import React, { createContext, useContext, useMemo, useState } from 'react';

type VoiceMessagePlaybackContextValue = {
  activePlaybackId: string | null;
  setActivePlaybackId: (id: string | null) => void;
};

const VoiceMessagePlaybackContext =
  createContext<VoiceMessagePlaybackContextValue | null>(null);

export const VoiceMessagePlaybackProvider: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const [activePlaybackId, setActivePlaybackId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      activePlaybackId,
      setActivePlaybackId,
    }),
    [activePlaybackId]
  );

  return (
    <VoiceMessagePlaybackContext.Provider value={value}>
      {children}
    </VoiceMessagePlaybackContext.Provider>
  );
};

export const useVoiceMessagePlayback = () => {
  const context = useContext(VoiceMessagePlaybackContext);

  if (!context) {
    throw new Error(
      'useVoiceMessagePlayback must be used inside VoiceMessagePlaybackProvider'
    );
  }

  return context;
};
