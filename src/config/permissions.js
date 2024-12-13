const PERMISSIONS = {
    // Command permissions
    COMMANDS: {
        ADMIN_ONLY: [
            'transfer-admin',
            'config',
            'listen',
            'mute',
            'unmute',
            'voice-settings'
        ],
        USER: [
            'help',
            'status'
        ]
    },
    
    // Timeout settings (in milliseconds)
    TIMEOUTS: {
        ADMIN_INACTIVITY: 1000 * 60 * 60 * 24, // 24 hours
        VOICE_SESSION: 1000 * 60 * 60 * 2,     // 2 hours
    },
    
    // Error messages
    ERRORS: {
        NOT_ADMIN: 'Only the admin can use this command.',
        NO_ADMIN: 'No admin is set for this server.',
        NOT_IN_VOICE: 'Bot is not in a voice channel.',
        INVALID_USER: 'Invalid user mentioned.',
        NO_PERMISSION: 'You do not have permission to use this command.'
    },
    
    // Success messages
    SUCCESS: {
        ADMIN_TRANSFERRED: 'Admin privileges transferred to',
        USER_ADDED: 'User added to allowed list.',
        USER_REMOVED: 'User removed from allowed list.',
        LISTENING_EVERYONE: 'Now listening to everyone in the channel.',
        LISTENING_WHITELIST: 'Now listening only to whitelisted users.',
        MUTED: 'Bot has been muted.',
        UNMUTED: 'Bot has been unmuted.',
        VOICE_UPDATED: 'Voice settings updated.'
    }
};

module.exports = { PERMISSIONS };