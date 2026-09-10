ALTER TABLE `auth_request_logs`
    MODIFY `request_type` ENUM('PASSWORD_RESET', 'LOGIN_ID_RECOVERY') NOT NULL;
