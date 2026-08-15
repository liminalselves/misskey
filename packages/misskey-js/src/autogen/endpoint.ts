import type {
	EmptyRequest,
	EmptyResponse,
	AdminAbuseReportNotificationRecipientCreateRequest,
	AdminAbuseReportNotificationRecipientCreateResponse,
	AdminAbuseReportNotificationRecipientDeleteRequest,
	AdminAbuseReportNotificationRecipientListRequest,
	AdminAbuseReportNotificationRecipientListResponse,
	AdminAbuseReportNotificationRecipientShowRequest,
	AdminAbuseReportNotificationRecipientShowResponse,
	AdminAbuseReportNotificationRecipientUpdateRequest,
	AdminAbuseReportNotificationRecipientUpdateResponse,
	AdminAbuseUserReportsRequest,
	AdminAbuseUserReportsResponse,
	AdminAccountsCreateRequest,
	AdminAccountsCreateResponse,
	AdminAccountsDeleteRequest,
	AdminAccountsFindByEmailRequest,
	AdminAccountsFindByEmailResponse,
	AdminAdCreateRequest,
	AdminAdCreateResponse,
	AdminAdDeleteRequest,
	AdminAdListRequest,
	AdminAdListResponse,
	AdminAdUpdateRequest,
	AdminAgentsCheckinReportsRequest,
	AdminAgentsCheckinReportsResponse,
	AdminAgentsCheckinRevokeTodayResponse,
	AdminAgentsCharactersSetModerationBannedRequest,
	AdminAgentsCharactersSetModerationBannedResponse,
	AdminAgentsCreditsIssueRewardRequest,
	AdminAgentsCreditsIssueRewardResponse,
	AdminAgentsCreditsMigrationGenerateKeyResponse,
	AdminAgentsCreditsMigrationLogsRequest,
	AdminAgentsCreditsMigrationLogsResponse,
	AdminAgentsExternalAuditLogsListRequest,
	AdminAgentsExternalAuditLogsListResponse,
	AdminAgentsExternalAuditLogsShowRequest,
	AdminAgentsExternalAuditLogsShowResponse,
	AdminAgentsExternalAuditModelsStatsResponse,
	AdminAgentsGovernanceExternalAuditDetailRequest,
	AdminAgentsGovernanceExternalAuditDetailResponse,
	AdminAgentsGovernanceExternalAuditListRequest,
	AdminAgentsGovernanceExternalAuditListResponse,
	AdminAgentsGovernanceExternalAuditReviewIgnoreRequest,
	AdminAgentsGovernanceExternalAuditReviewIgnoreResponse,
	AdminAgentsGovernanceExternalAuditReviewListRequest,
	AdminAgentsGovernanceExternalAuditReviewListResponse,
	AdminAgentsGovernanceImagesListRequest,
	AdminAgentsGovernanceImagesListResponse,
	AdminAgentsGovernanceImagesSetBlockedRequest,
	AdminAgentsGovernanceImagesSetBlockedResponse,
	AdminAgentsGovernanceLogsListRequest,
	AdminAgentsGovernanceLogsListResponse,
	AdminAgentsGovernanceMessagesListRequest,
	AdminAgentsGovernanceMessagesListResponse,
	AdminAgentsGovernanceQuickActionRequest,
	AdminAgentsGovernanceQuickActionResponse,
	AdminAgentsGovernanceReviewDetailRequest,
	AdminAgentsGovernanceReviewDetailResponse,
	AdminAgentsGovernanceReviewListRequest,
	AdminAgentsGovernanceReviewListResponse,
	AdminAgentsGovernanceReviewResolveRequest,
	AdminAgentsGovernanceReviewResolveResponse,
	AdminAgentsGovernanceReviewSetCharacterBannedRequest,
	AdminAgentsGovernanceReviewSetCharacterBannedResponse,
	AdminAgentsGovernanceSessionsDetailRequest,
	AdminAgentsGovernanceSessionsDetailResponse,
	AdminAgentsGovernanceSessionsListRequest,
	AdminAgentsGovernanceSessionsListResponse,
	AdminAgentsGovernanceSessionsSetBannedRequest,
	AdminAgentsGovernanceSessionsSetBannedResponse,
	AdminAgentsGovernanceSummaryResponse,
	AdminAgentsImagesListRequest,
	AdminAgentsImagesListResponse,
	AdminAgentsImagesSetBlockedRequest,
	AdminAgentsImagesSetBlockedResponse,
	AdminAgentsImagesTokensRefreshResponse,
	AdminAgentsImagesTokensTestRequest,
	AdminAgentsImagesTokensTestResponse,
	AdminAgentsMessagesListRequest,
	AdminAgentsMessagesListResponse,
	AdminAgentsMessagesTimelineRequest,
	AdminAgentsMessagesTimelineResponse,
	AdminAgentsRedeemCodesGenerateRequest,
	AdminAgentsRedeemCodesGenerateResponse,
	AdminAgentsRedeemCodesListRequest,
	AdminAgentsRedeemCodesListResponse,
	AdminAgentsRedeemCodesRevokeRequest,
	AdminAgentsRedeemCodesRevokeResponse,
	AdminAgentsReportsOverviewRequest,
	AdminAgentsReportsOverviewResponse,
	AdminAgentsReviewDiffRequest,
	AdminAgentsReviewDiffResponse,
	AdminAgentsReviewListPendingRequest,
	AdminAgentsReviewListPendingResponse,
	AdminAgentsReviewLogsRequest,
	AdminAgentsReviewLogsResponse,
	AdminAgentsReviewPendingExistsResponse,
	AdminAgentsReviewResolveRequest,
	AdminAgentsReviewResolveResponse,
	AdminAgentsSessionsListRequest,
	AdminAgentsSessionsListResponse,
	AdminAgentsSessionsSetModerationBannedRequest,
	AdminAgentsSessionsSetModerationBannedResponse,
	AdminAgentsTokenizerStatusResponse,
	AdminAnnouncementsCreateRequest,
	AdminAnnouncementsCreateResponse,
	AdminAnnouncementsDeleteRequest,
	AdminAnnouncementsListRequest,
	AdminAnnouncementsListResponse,
	AdminAnnouncementsUpdateRequest,
	AdminAvatarDecorationsCreateRequest,
	AdminAvatarDecorationsCreateResponse,
	AdminAvatarDecorationsDeleteRequest,
	AdminAvatarDecorationsListRequest,
	AdminAvatarDecorationsListResponse,
	AdminAvatarDecorationsUpdateRequest,
	AdminCaptchaCurrentResponse,
	AdminCaptchaSaveRequest,
	AdminDeleteAccountRequest,
	AdminDeleteAllFilesOfAUserRequest,
	AdminDriveFilesRequest,
	AdminDriveFilesResponse,
	AdminDriveFilesSetBlockedRequest,
	AdminDriveFilesSetBlockedResponse,
	AdminDriveShowFileRequest,
	AdminDriveShowFileResponse,
	AdminEmojiAddRequest,
	AdminEmojiAddResponse,
	AdminEmojiAddAliasesBulkRequest,
	AdminEmojiCopyRequest,
	AdminEmojiCopyResponse,
	AdminEmojiDeleteRequest,
	AdminEmojiDeleteBulkRequest,
	AdminEmojiImportZipRequest,
	AdminEmojiListRequest,
	AdminEmojiListResponse,
	AdminEmojiListRemoteRequest,
	AdminEmojiListRemoteResponse,
	AdminEmojiRemoveAliasesBulkRequest,
	AdminEmojiSetAliasesBulkRequest,
	AdminEmojiSetCategoryBulkRequest,
	AdminEmojiSetLicenseBulkRequest,
	AdminEmojiUpdateRequest,
	AdminFederationDeleteAllFilesRequest,
	AdminFederationRefreshRemoteInstanceMetadataRequest,
	AdminFederationRemoveAllFollowingRequest,
	AdminFederationUpdateInstanceRequest,
	AdminForwardAbuseUserReportRequest,
	AdminGetIndexStatsResponse,
	AdminGetTableStatsResponse,
	AdminGetUserIpsRequest,
	AdminGetUserIpsResponse,
	AdminInviteCreateRequest,
	AdminInviteCreateResponse,
	AdminInviteListRequest,
	AdminInviteListResponse,
	AdminMetaResponse,
	AdminMigrateFeaturedRankingResponse,
	AdminMobilePushClearDevicesResponse,
	AdminPromoCreateRequest,
	AdminQueueClearRequest,
	AdminQueueDeliverDelayedResponse,
	AdminQueueInboxDelayedResponse,
	AdminQueueJobsRequest,
	AdminQueueJobsResponse,
	AdminQueuePromoteJobsRequest,
	AdminQueueQueueStatsRequest,
	AdminQueueQueueStatsResponse,
	AdminQueueQueuesResponse,
	AdminQueueRemoveJobRequest,
	AdminQueueRetryJobRequest,
	AdminQueueShowJobRequest,
	AdminQueueShowJobResponse,
	AdminQueueShowJobLogsRequest,
	AdminQueueShowJobLogsResponse,
	AdminQueueStatsResponse,
	AdminRelaysAddRequest,
	AdminRelaysAddResponse,
	AdminRelaysListResponse,
	AdminRelaysRemoveRequest,
	AdminResetPasswordRequest,
	AdminResetPasswordResponse,
	AdminResolveAbuseUserReportRequest,
	AdminRolesAssignRequest,
	AdminRolesCreateRequest,
	AdminRolesCreateResponse,
	AdminRolesDeleteRequest,
	AdminRolesListResponse,
	AdminRolesShowRequest,
	AdminRolesShowResponse,
	AdminRolesUnassignRequest,
	AdminRolesUpdateRequest,
	AdminRolesUpdateDefaultPoliciesRequest,
	AdminRolesUsersRequest,
	AdminRolesUsersResponse,
	AdminSendEmailRequest,
	AdminServerInfoResponse,
	AdminShowModerationLogsRequest,
	AdminShowModerationLogsResponse,
	AdminShowUserRequest,
	AdminShowUserResponse,
	AdminShowUsersRequest,
	AdminShowUsersResponse,
	AdminSuspendUserRequest,
	AdminSystemWebhookCreateRequest,
	AdminSystemWebhookCreateResponse,
	AdminSystemWebhookDeleteRequest,
	AdminSystemWebhookListRequest,
	AdminSystemWebhookListResponse,
	AdminSystemWebhookShowRequest,
	AdminSystemWebhookShowResponse,
	AdminSystemWebhookTestRequest,
	AdminSystemWebhookUpdateRequest,
	AdminSystemWebhookUpdateResponse,
	AdminUnsetUserAvatarRequest,
	AdminUnsetUserBannerRequest,
	AdminUnsuspendUserRequest,
	AdminUpdateAbuseUserReportRequest,
	AdminUpdateMetaRequest,
	AdminUpdateProxyAccountRequest,
	AdminUpdateProxyAccountResponse,
	AdminUpdateUserNoteRequest,
	AdminUsersAgentSuccessRateRequest,
	AdminUsersAgentSuccessRateResponse,
	AgentsBillingLogsRequest,
	AgentsBillingLogsResponse,
	AgentsByokModelsCreateRequest,
	AgentsByokModelsCreateResponse,
	AgentsByokModelsDeleteRequest,
	AgentsByokModelsDeleteResponse,
	AgentsByokModelsListResponse,
	AgentsByokModelsUpdateRequest,
	AgentsByokModelsUpdateResponse,
	AgentsCharactersCreateRequest,
	AgentsCharactersCreateResponse,
	AgentsCharactersDeleteRequest,
	AgentsCharactersDeleteResponse,
	AgentsCharactersDiffRequest,
	AgentsCharactersDiffResponse,
	AgentsCharactersListMineResponse,
	AgentsCharactersPlazaDetailRequest,
	AgentsCharactersPlazaDetailResponse,
	AgentsCharactersPublicListRequest,
	AgentsCharactersPublicListResponse,
	AgentsCharactersPublishRequest,
	AgentsCharactersPublishResponse,
	AgentsCharactersRollbackRequest,
	AgentsCharactersRollbackResponse,
	AgentsCharactersShowRequest,
	AgentsCharactersShowResponse,
	AgentsCharactersUnpublishRequest,
	AgentsCharactersUnpublishResponse,
	AgentsCharactersUpdateRequest,
	AgentsCharactersUpdateResponse,
	AgentsCharactersVersionsRequest,
	AgentsCharactersVersionsResponse,
	AgentsCharactersWorldbookMatchPreviewRequest,
	AgentsCharactersWorldbookMatchPreviewResponse,
	AgentsCheckinResponse,
	AgentsCheckinMakeupRequest,
	AgentsCheckinMakeupResponse,
	AgentsCheckinStatusRequest,
	AgentsCheckinStatusResponse,
	AgentsCompressionStickyDeleteRequest,
	AgentsCompressionStickyDeleteResponse,
	AgentsCompressionStickyImportRequest,
	AgentsCompressionStickyImportResponse,
	AgentsCompressionStickyListRequest,
	AgentsCompressionStickyListResponse,
	AgentsCompressionStickyReorderRequest,
	AgentsCompressionStickyReorderResponse,
	AgentsCompressionStickyUpdateRequest,
	AgentsCompressionStickyUpdateResponse,
	AgentsCreditBalanceResponse,
	AgentsCreditsMigrateRequest,
	AgentsCreditsMigrateResponse,
	AgentsImagesGenerateRequest,
	AgentsImagesGenerateResponse,
	AgentsImagesGeneratePlaceholderRequest,
	AgentsImagesGeneratePlaceholderResponse,
	AgentsImagesModelsListResponse,
	AgentsImagesPlaceholderStatusRequest,
	AgentsImagesPlaceholderStatusResponse,
	AgentsImagesPresetsListResponse,
	AgentsMemoryAddRequest,
	AgentsMemoryAddResponse,
	AgentsMemoryDeleteRequest,
	AgentsMemoryDeleteResponse,
	AgentsMemoryListRequest,
	AgentsMemoryListResponse,
	AgentsMemoryUpdateRequest,
	AgentsMemoryUpdateResponse,
	AgentsMessagesAbortRequest,
	AgentsMessagesAbortResponse,
	AgentsMessagesDeleteRequest,
	AgentsMessagesDeleteResponse,
	AgentsMessagesImportContextRequest,
	AgentsMessagesImportContextResponse,
	AgentsMessagesRollbackRequest,
	AgentsMessagesRollbackResponse,
	AgentsMessagesSearchRequest,
	AgentsMessagesSearchResponse,
	AgentsMessagesSendRequest,
	AgentsMessagesSendResponse,
	AgentsMessagesShowRequest,
	AgentsMessagesShowResponse,
	AgentsMessagesTimelineRequest,
	AgentsMessagesTimelineResponse,
	AgentsMessagesUpdateRequest,
	AgentsMessagesUpdateResponse,
	AgentsModelsFreeQuotaResponse,
	AgentsModelsSuccessRatesRequest,
	AgentsModelsSuccessRatesResponse,
	AgentsMyUsageSummaryRequest,
	AgentsMyUsageSummaryResponse,
	AgentsPlazaReviewsCreateRequest,
	AgentsPlazaReviewsCreateResponse,
	AgentsPlazaReviewsListRequest,
	AgentsPlazaReviewsListResponse,
	AgentsPlazaSearchRequest,
	AgentsPlazaSearchResponse,
	AgentsProactiveSchedulesDeleteRequest,
	AgentsProactiveSchedulesDeleteResponse,
	AgentsProactiveSchedulesImportRequest,
	AgentsProactiveSchedulesImportResponse,
	AgentsProactiveSchedulesListRequest,
	AgentsProactiveSchedulesListResponse,
	AgentsProactiveSchedulesSetStatusRequest,
	AgentsProactiveSchedulesSetStatusResponse,
	AgentsRedeemCodeRequest,
	AgentsRedeemCodeResponse,
	AgentsSessionsCompressionOverviewRequest,
	AgentsSessionsCompressionOverviewResponse,
	AgentsSessionsContextWindowRequest,
	AgentsSessionsContextWindowResponse,
	AgentsSessionsCreateRequest,
	AgentsSessionsCreateResponse,
	AgentsSessionsDeleteRequest,
	AgentsSessionsDeleteResponse,
	AgentsSessionsListMineResponse,
	AgentsSessionsPreviewModelChangeRequest,
	AgentsSessionsPreviewModelChangeResponse,
	AgentsSessionsReadRequest,
	AgentsSessionsRuleListRequest,
	AgentsSessionsRuleListResponse,
	AgentsSessionsShowRequest,
	AgentsSessionsShowResponse,
	AgentsSessionsUpdateRequest,
	AgentsSessionsUpdateResponse,
	AgentsSessionsWorldbookListRequest,
	AgentsSessionsWorldbookListResponse,
	AgentsSessionsWorldbookMatchPreviewRequest,
	AgentsSessionsWorldbookMatchPreviewResponse,
	AgentsStylesCreateRequest,
	AgentsStylesCreateResponse,
	AgentsStylesDeleteRequest,
	AgentsStylesDeleteResponse,
	AgentsStylesDiffRequest,
	AgentsStylesDiffResponse,
	AgentsStylesListMineResponse,
	AgentsStylesListUsableResponse,
	AgentsStylesPlazaDetailRequest,
	AgentsStylesPlazaDetailResponse,
	AgentsStylesPublicListRequest,
	AgentsStylesPublicListResponse,
	AgentsStylesPublishRequest,
	AgentsStylesPublishResponse,
	AgentsStylesRollbackRequest,
	AgentsStylesRollbackResponse,
	AgentsStylesShowRequest,
	AgentsStylesShowResponse,
	AgentsStylesSubscribeRequest,
	AgentsStylesSubscribeResponse,
	AgentsStylesUnpublishRequest,
	AgentsStylesUnpublishResponse,
	AgentsStylesUnsubscribeRequest,
	AgentsStylesUnsubscribeResponse,
	AgentsStylesUpdateRequest,
	AgentsStylesUpdateResponse,
	AgentsStylesVersionsRequest,
	AgentsStylesVersionsResponse,
	AgentsVisionModelsListResponse,
	AnnouncementsRequest,
	AnnouncementsResponse,
	AnnouncementsShowRequest,
	AnnouncementsShowResponse,
	AntennasCreateRequest,
	AntennasCreateResponse,
	AntennasDeleteRequest,
	AntennasListResponse,
	AntennasNotesRequest,
	AntennasNotesResponse,
	AntennasShowRequest,
	AntennasShowResponse,
	AntennasUpdateRequest,
	AntennasUpdateResponse,
	ApGetRequest,
	ApGetResponse,
	ApShowRequest,
	ApShowResponse,
	AppCreateRequest,
	AppCreateResponse,
	AppShowRequest,
	AppShowResponse,
	AuthAcceptRequest,
	AuthSessionGenerateRequest,
	AuthSessionGenerateResponse,
	AuthSessionShowRequest,
	AuthSessionShowResponse,
	AuthSessionUserkeyRequest,
	AuthSessionUserkeyResponse,
	BlockingCreateRequest,
	BlockingCreateResponse,
	BlockingDeleteRequest,
	BlockingDeleteResponse,
	BlockingListRequest,
	BlockingListResponse,
	BubbleGameRankingRequest,
	BubbleGameRankingResponse,
	BubbleGameRegisterRequest,
	ChannelsCreateRequest,
	ChannelsCreateResponse,
	ChannelsFavoriteRequest,
	ChannelsFeaturedResponse,
	ChannelsFollowRequest,
	ChannelsFollowedRequest,
	ChannelsFollowedResponse,
	ChannelsMuteCreateRequest,
	ChannelsMuteDeleteRequest,
	ChannelsMuteListResponse,
	ChannelsMyFavoritesResponse,
	ChannelsOwnedRequest,
	ChannelsOwnedResponse,
	ChannelsSearchRequest,
	ChannelsSearchResponse,
	ChannelsShowRequest,
	ChannelsShowResponse,
	ChannelsTimelineRequest,
	ChannelsTimelineResponse,
	ChannelsUnfavoriteRequest,
	ChannelsUnfollowRequest,
	ChannelsUpdateRequest,
	ChannelsUpdateResponse,
	ChartsActiveUsersRequest,
	ChartsActiveUsersResponse,
	ChartsApRequestRequest,
	ChartsApRequestResponse,
	ChartsDriveRequest,
	ChartsDriveResponse,
	ChartsFederationRequest,
	ChartsFederationResponse,
	ChartsInstanceRequest,
	ChartsInstanceResponse,
	ChartsNotesRequest,
	ChartsNotesResponse,
	ChartsUserDriveRequest,
	ChartsUserDriveResponse,
	ChartsUserFollowingRequest,
	ChartsUserFollowingResponse,
	ChartsUserNotesRequest,
	ChartsUserNotesResponse,
	ChartsUserPvRequest,
	ChartsUserPvResponse,
	ChartsUserReactionsRequest,
	ChartsUserReactionsResponse,
	ChartsUsersRequest,
	ChartsUsersResponse,
	ChatHistoryRequest,
	ChatHistoryResponse,
	ChatMessagesCreateToRoomRequest,
	ChatMessagesCreateToRoomResponse,
	ChatMessagesCreateToUserRequest,
	ChatMessagesCreateToUserResponse,
	ChatMessagesDeleteRequest,
	ChatMessagesReactRequest,
	ChatMessagesRoomTimelineRequest,
	ChatMessagesRoomTimelineResponse,
	ChatMessagesSearchRequest,
	ChatMessagesSearchResponse,
	ChatMessagesShowRequest,
	ChatMessagesShowResponse,
	ChatMessagesUnreactRequest,
	ChatMessagesUserTimelineRequest,
	ChatMessagesUserTimelineResponse,
	ChatReadRequest,
	ChatRoomsCreateRequest,
	ChatRoomsCreateResponse,
	ChatRoomsDeleteRequest,
	ChatRoomsInvitationsCreateRequest,
	ChatRoomsInvitationsCreateResponse,
	ChatRoomsInvitationsIgnoreRequest,
	ChatRoomsInvitationsInboxRequest,
	ChatRoomsInvitationsInboxResponse,
	ChatRoomsInvitationsOutboxRequest,
	ChatRoomsInvitationsOutboxResponse,
	ChatRoomsJoinRequest,
	ChatRoomsJoiningRequest,
	ChatRoomsJoiningResponse,
	ChatRoomsKickRequest,
	ChatRoomsLeaveRequest,
	ChatRoomsMembersRequest,
	ChatRoomsMembersResponse,
	ChatRoomsMuteRequest,
	ChatRoomsOwnedRequest,
	ChatRoomsOwnedResponse,
	ChatRoomsSearchRequest,
	ChatRoomsSearchResponse,
	ChatRoomsShowRequest,
	ChatRoomsShowResponse,
	ChatRoomsSuspendRequest,
	ChatRoomsUnsuspendRequest,
	ChatRoomsUpdateRequest,
	ChatRoomsUpdateResponse,
	ClipsAddNoteRequest,
	ClipsCreateRequest,
	ClipsCreateResponse,
	ClipsDeleteRequest,
	ClipsFavoriteRequest,
	ClipsListRequest,
	ClipsListResponse,
	ClipsMyFavoritesResponse,
	ClipsNotesRequest,
	ClipsNotesResponse,
	ClipsRemoveNoteRequest,
	ClipsShowRequest,
	ClipsShowResponse,
	ClipsUnfavoriteRequest,
	ClipsUpdateRequest,
	ClipsUpdateResponse,
	DriveResponse,
	DriveFilesRequest,
	DriveFilesResponse,
	DriveFilesAttachedChatMessagesRequest,
	DriveFilesAttachedChatMessagesResponse,
	DriveFilesAttachedNotesRequest,
	DriveFilesAttachedNotesResponse,
	DriveFilesCheckExistenceRequest,
	DriveFilesCheckExistenceResponse,
	DriveFilesCreateRequest,
	DriveFilesCreateResponse,
	DriveFilesDeleteRequest,
	DriveFilesDownloadUrlRequest,
	DriveFilesDownloadUrlResponse,
	DriveFilesFindRequest,
	DriveFilesFindResponse,
	DriveFilesFindByHashRequest,
	DriveFilesFindByHashResponse,
	DriveFilesMoveBulkRequest,
	DriveFilesShowRequest,
	DriveFilesShowResponse,
	DriveFilesUpdateRequest,
	DriveFilesUpdateResponse,
	DriveFilesUploadFromUrlRequest,
	DriveFoldersRequest,
	DriveFoldersResponse,
	DriveFoldersCreateRequest,
	DriveFoldersCreateResponse,
	DriveFoldersDeleteRequest,
	DriveFoldersFindRequest,
	DriveFoldersFindResponse,
	DriveFoldersShowRequest,
	DriveFoldersShowResponse,
	DriveFoldersUpdateRequest,
	DriveFoldersUpdateResponse,
	DriveStatsResponse,
	DriveStreamRequest,
	DriveStreamResponse,
	EmailAddressAvailableRequest,
	EmailAddressAvailableResponse,
	EmojiRequest,
	EmojiResponse,
	EmojisResponse,
	EndpointRequest,
	EndpointResponse,
	EndpointsResponse,
	FederationFollowersRequest,
	FederationFollowersResponse,
	FederationFollowingRequest,
	FederationFollowingResponse,
	FederationInstancesRequest,
	FederationInstancesResponse,
	FederationShowInstanceRequest,
	FederationShowInstanceResponse,
	FederationStatsRequest,
	FederationStatsResponse,
	FederationUpdateRemoteUserRequest,
	FederationUsersRequest,
	FederationUsersResponse,
	FetchExternalResourcesRequest,
	FetchExternalResourcesResponse,
	FetchRssRequest,
	FetchRssResponse,
	FlashCreateRequest,
	FlashCreateResponse,
	FlashDeleteRequest,
	FlashFeaturedRequest,
	FlashFeaturedResponse,
	FlashLikeRequest,
	FlashMyRequest,
	FlashMyResponse,
	FlashMyLikesRequest,
	FlashMyLikesResponse,
	FlashSearchRequest,
	FlashSearchResponse,
	FlashShowRequest,
	FlashShowResponse,
	FlashUnlikeRequest,
	FlashUpdateRequest,
	FollowingCreateRequest,
	FollowingCreateResponse,
	FollowingDeleteRequest,
	FollowingDeleteResponse,
	FollowingInvalidateRequest,
	FollowingInvalidateResponse,
	FollowingRequestsAcceptRequest,
	FollowingRequestsCancelRequest,
	FollowingRequestsCancelResponse,
	FollowingRequestsListRequest,
	FollowingRequestsListResponse,
	FollowingRequestsRejectRequest,
	FollowingRequestsSentRequest,
	FollowingRequestsSentResponse,
	FollowingUpdateRequest,
	FollowingUpdateResponse,
	FollowingUpdateAllRequest,
	GalleryFeaturedRequest,
	GalleryFeaturedResponse,
	GalleryPopularResponse,
	GalleryPostsRequest,
	GalleryPostsResponse,
	GalleryPostsCreateRequest,
	GalleryPostsCreateResponse,
	GalleryPostsDeleteRequest,
	GalleryPostsLikeRequest,
	GalleryPostsShowRequest,
	GalleryPostsShowResponse,
	GalleryPostsUnlikeRequest,
	GalleryPostsUpdateRequest,
	GalleryPostsUpdateResponse,
	GetAvatarDecorationsResponse,
	GetOnlineUsersCountResponse,
	HashtagsListRequest,
	HashtagsListResponse,
	HashtagsSearchRequest,
	HashtagsSearchResponse,
	HashtagsShowRequest,
	HashtagsShowResponse,
	HashtagsTrendResponse,
	HashtagsUsersRequest,
	HashtagsUsersResponse,
	IResponse,
	I2faDoneRequest,
	I2faDoneResponse,
	I2faKeyDoneRequest,
	I2faKeyDoneResponse,
	I2faPasswordLessRequest,
	I2faRegisterRequest,
	I2faRegisterResponse,
	I2faRegisterKeyRequest,
	I2faRegisterKeyResponse,
	I2faRemoveKeyRequest,
	I2faUnregisterRequest,
	I2faUpdateKeyRequest,
	IAppsRequest,
	IAppsResponse,
	IAuthorizedAppsRequest,
	IAuthorizedAppsResponse,
	IChangePasswordRequest,
	IClaimAchievementRequest,
	IDeleteAccountRequest,
	IExportFollowingRequest,
	IFavoritesRequest,
	IFavoritesResponse,
	IGalleryLikesRequest,
	IGalleryLikesResponse,
	IGalleryPostsRequest,
	IGalleryPostsResponse,
	IImportAntennasRequest,
	IImportBlockingRequest,
	IImportFollowingRequest,
	IImportMutingRequest,
	IImportUserListsRequest,
	IMoveRequest,
	IMoveResponse,
	INotificationsRequest,
	INotificationsResponse,
	INotificationsGroupedRequest,
	INotificationsGroupedResponse,
	IPageLikesRequest,
	IPageLikesResponse,
	IPagesRequest,
	IPagesResponse,
	IPinRequest,
	IPinResponse,
	IReadAnnouncementRequest,
	IRegenerateTokenRequest,
	IRegistryGetRequest,
	IRegistryGetResponse,
	IRegistryGetAllRequest,
	IRegistryGetAllResponse,
	IRegistryGetDetailRequest,
	IRegistryGetDetailResponse,
	IRegistryKeysRequest,
	IRegistryKeysResponse,
	IRegistryKeysWithTypeRequest,
	IRegistryKeysWithTypeResponse,
	IRegistryRemoveRequest,
	IRegistryScopesWithDomainResponse,
	IRegistrySetRequest,
	IRevokeTokenRequest,
	ISigninHistoryRequest,
	ISigninHistoryResponse,
	IUnpinRequest,
	IUnpinResponse,
	IUpdateRequest,
	IUpdateResponse,
	IUpdateEmailRequest,
	IUpdateEmailResponse,
	IWebhooksCreateRequest,
	IWebhooksCreateResponse,
	IWebhooksDeleteRequest,
	IWebhooksListResponse,
	IWebhooksShowRequest,
	IWebhooksShowResponse,
	IWebhooksTestRequest,
	IWebhooksUpdateRequest,
	InviteCreateResponse,
	InviteDeleteRequest,
	InviteLimitResponse,
	InviteListRequest,
	InviteListResponse,
	MetaRequest,
	MetaResponse,
	MiauthGenTokenRequest,
	MiauthGenTokenResponse,
	MobilePushRegisterRequest,
	MobilePushRegisterResponse,
	MobilePushUnregisterRequest,
	MobilePushUnregisterResponse,
	MuteCreateRequest,
	MuteDeleteRequest,
	MuteListRequest,
	MuteListResponse,
	MyAppsRequest,
	MyAppsResponse,
	NotesRequest,
	NotesResponse,
	NotesChildrenRequest,
	NotesChildrenResponse,
	NotesClipsRequest,
	NotesClipsResponse,
	NotesConversationRequest,
	NotesConversationResponse,
	NotesCreateRequest,
	NotesCreateResponse,
	NotesDeleteRequest,
	NotesDraftsCountResponse,
	NotesDraftsCreateRequest,
	NotesDraftsCreateResponse,
	NotesDraftsDeleteRequest,
	NotesDraftsListRequest,
	NotesDraftsListResponse,
	NotesDraftsUpdateRequest,
	NotesDraftsUpdateResponse,
	NotesFavoritesCreateRequest,
	NotesFavoritesDeleteRequest,
	NotesFeaturedRequest,
	NotesFeaturedResponse,
	NotesGlobalTimelineRequest,
	NotesGlobalTimelineResponse,
	NotesHybridTimelineRequest,
	NotesHybridTimelineResponse,
	NotesLocalTimelineRequest,
	NotesLocalTimelineResponse,
	NotesMentionsRequest,
	NotesMentionsResponse,
	NotesPollsRecommendationRequest,
	NotesPollsRecommendationResponse,
	NotesPollsVoteRequest,
	NotesReactionsRequest,
	NotesReactionsResponse,
	NotesReactionsCreateRequest,
	NotesReactionsDeleteRequest,
	NotesRenotesRequest,
	NotesRenotesResponse,
	NotesRepliesRequest,
	NotesRepliesResponse,
	NotesSearchRequest,
	NotesSearchResponse,
	NotesSearchByTagRequest,
	NotesSearchByTagResponse,
	NotesShowRequest,
	NotesShowResponse,
	NotesShowPartialBulkRequest,
	NotesShowPartialBulkResponse,
	NotesStateRequest,
	NotesStateResponse,
	NotesThreadMutingCreateRequest,
	NotesThreadMutingDeleteRequest,
	NotesTimelineRequest,
	NotesTimelineResponse,
	NotesTranslateRequest,
	NotesTranslateResponse,
	NotesUnrenoteRequest,
	NotesUserListTimelineRequest,
	NotesUserListTimelineResponse,
	NotificationsCreateRequest,
	PagePushRequest,
	PagesCreateRequest,
	PagesCreateResponse,
	PagesDeleteRequest,
	PagesFeaturedResponse,
	PagesLikeRequest,
	PagesShowRequest,
	PagesShowResponse,
	PagesUnlikeRequest,
	PagesUpdateRequest,
	PingResponse,
	PinnedUsersResponse,
	PromoReadRequest,
	RenoteMuteCreateRequest,
	RenoteMuteDeleteRequest,
	RenoteMuteListRequest,
	RenoteMuteListResponse,
	RequestResetPasswordRequest,
	ResetPasswordRequest,
	RetentionResponse,
	ReversiCancelMatchRequest,
	ReversiGamesRequest,
	ReversiGamesResponse,
	ReversiInvitationsResponse,
	ReversiMatchRequest,
	ReversiMatchResponse,
	ReversiShowGameRequest,
	ReversiShowGameResponse,
	ReversiSurrenderRequest,
	ReversiVerifyRequest,
	ReversiVerifyResponse,
	RolesListResponse,
	RolesNotesRequest,
	RolesNotesResponse,
	RolesShowRequest,
	RolesShowResponse,
	RolesUsersRequest,
	RolesUsersResponse,
	ServerInfoResponse,
	StatsResponse,
	SwRegisterRequest,
	SwRegisterResponse,
	SwShowRegistrationRequest,
	SwShowRegistrationResponse,
	SwUnregisterRequest,
	SwUpdateRegistrationRequest,
	SwUpdateRegistrationResponse,
	TestRequest,
	TestResponse,
	UsernameAvailableRequest,
	UsernameAvailableResponse,
	UsersRequest,
	UsersResponse,
	UsersAchievementsRequest,
	UsersAchievementsResponse,
	UsersClipsRequest,
	UsersClipsResponse,
	UsersFeaturedNotesRequest,
	UsersFeaturedNotesResponse,
	UsersFlashsRequest,
	UsersFlashsResponse,
	UsersFollowersRequest,
	UsersFollowersResponse,
	UsersFollowingRequest,
	UsersFollowingResponse,
	UsersGalleryPostsRequest,
	UsersGalleryPostsResponse,
	UsersGetFollowingBirthdayUsersRequest,
	UsersGetFollowingBirthdayUsersResponse,
	UsersGetFrequentlyRepliedUsersRequest,
	UsersGetFrequentlyRepliedUsersResponse,
	UsersListsCreateRequest,
	UsersListsCreateResponse,
	UsersListsCreateFromPublicRequest,
	UsersListsCreateFromPublicResponse,
	UsersListsDeleteRequest,
	UsersListsFavoriteRequest,
	UsersListsGetMembershipsRequest,
	UsersListsGetMembershipsResponse,
	UsersListsListRequest,
	UsersListsListResponse,
	UsersListsPullRequest,
	UsersListsPushRequest,
	UsersListsShowRequest,
	UsersListsShowResponse,
	UsersListsUnfavoriteRequest,
	UsersListsUpdateRequest,
	UsersListsUpdateResponse,
	UsersListsUpdateMembershipRequest,
	UsersNotesRequest,
	UsersNotesResponse,
	UsersPagesRequest,
	UsersPagesResponse,
	UsersReactionsRequest,
	UsersReactionsResponse,
	UsersRecommendationRequest,
	UsersRecommendationResponse,
	UsersRelationRequest,
	UsersRelationResponse,
	UsersReportAbuseRequest,
	UsersSearchRequest,
	UsersSearchResponse,
	UsersSearchByUsernameAndHostRequest,
	UsersSearchByUsernameAndHostResponse,
	UsersShowRequest,
	UsersShowResponse,
	UsersUpdateMemoRequest,
	V2AdminEmojiListRequest,
	V2AdminEmojiListResponse,
	VerifyEmailRequest,
} from './entities.js';

export type Endpoints = {
	'admin/abuse-report/notification-recipient/create': { req: AdminAbuseReportNotificationRecipientCreateRequest; res: AdminAbuseReportNotificationRecipientCreateResponse };
	'admin/abuse-report/notification-recipient/delete': { req: AdminAbuseReportNotificationRecipientDeleteRequest; res: EmptyResponse };
	'admin/abuse-report/notification-recipient/list': { req: AdminAbuseReportNotificationRecipientListRequest; res: AdminAbuseReportNotificationRecipientListResponse };
	'admin/abuse-report/notification-recipient/show': { req: AdminAbuseReportNotificationRecipientShowRequest; res: AdminAbuseReportNotificationRecipientShowResponse };
	'admin/abuse-report/notification-recipient/update': { req: AdminAbuseReportNotificationRecipientUpdateRequest; res: AdminAbuseReportNotificationRecipientUpdateResponse };
	'admin/abuse-user-reports': { req: AdminAbuseUserReportsRequest; res: AdminAbuseUserReportsResponse };
	'admin/accounts/create': { req: AdminAccountsCreateRequest; res: AdminAccountsCreateResponse };
	'admin/accounts/delete': { req: AdminAccountsDeleteRequest; res: EmptyResponse };
	'admin/accounts/find-by-email': { req: AdminAccountsFindByEmailRequest; res: AdminAccountsFindByEmailResponse };
	'admin/ad/create': { req: AdminAdCreateRequest; res: AdminAdCreateResponse };
	'admin/ad/delete': { req: AdminAdDeleteRequest; res: EmptyResponse };
	'admin/ad/list': { req: AdminAdListRequest; res: AdminAdListResponse };
	'admin/ad/update': { req: AdminAdUpdateRequest; res: EmptyResponse };
	'admin/agents-checkin-reports': { req: AdminAgentsCheckinReportsRequest; res: AdminAgentsCheckinReportsResponse };
	'admin/agents-checkin-revoke-today': { req: EmptyRequest; res: AdminAgentsCheckinRevokeTodayResponse };
	'admin/agents/characters/set-moderation-banned': { req: AdminAgentsCharactersSetModerationBannedRequest; res: AdminAgentsCharactersSetModerationBannedResponse };
	'admin/agents/credits/issue-reward': { req: AdminAgentsCreditsIssueRewardRequest; res: AdminAgentsCreditsIssueRewardResponse };
	'admin/agents/credits/migration/generate-key': { req: EmptyRequest; res: AdminAgentsCreditsMigrationGenerateKeyResponse };
	'admin/agents/credits/migration/logs': { req: AdminAgentsCreditsMigrationLogsRequest; res: AdminAgentsCreditsMigrationLogsResponse };
	'admin/agents/external-audit/logs/list': { req: AdminAgentsExternalAuditLogsListRequest; res: AdminAgentsExternalAuditLogsListResponse };
	'admin/agents/external-audit/logs/show': { req: AdminAgentsExternalAuditLogsShowRequest; res: AdminAgentsExternalAuditLogsShowResponse };
	'admin/agents/external-audit/models/stats': { req: EmptyRequest; res: AdminAgentsExternalAuditModelsStatsResponse };
	'admin/agents/governance/external-audit/detail': { req: AdminAgentsGovernanceExternalAuditDetailRequest; res: AdminAgentsGovernanceExternalAuditDetailResponse };
	'admin/agents/governance/external-audit/list': { req: AdminAgentsGovernanceExternalAuditListRequest; res: AdminAgentsGovernanceExternalAuditListResponse };
	'admin/agents/governance/external-audit/review-ignore': { req: AdminAgentsGovernanceExternalAuditReviewIgnoreRequest; res: AdminAgentsGovernanceExternalAuditReviewIgnoreResponse };
	'admin/agents/governance/external-audit/review-list': { req: AdminAgentsGovernanceExternalAuditReviewListRequest; res: AdminAgentsGovernanceExternalAuditReviewListResponse };
	'admin/agents/governance/images/list': { req: AdminAgentsGovernanceImagesListRequest; res: AdminAgentsGovernanceImagesListResponse };
	'admin/agents/governance/images/set-blocked': { req: AdminAgentsGovernanceImagesSetBlockedRequest; res: AdminAgentsGovernanceImagesSetBlockedResponse };
	'admin/agents/governance/logs/list': { req: AdminAgentsGovernanceLogsListRequest; res: AdminAgentsGovernanceLogsListResponse };
	'admin/agents/governance/messages/list': { req: AdminAgentsGovernanceMessagesListRequest; res: AdminAgentsGovernanceMessagesListResponse };
	'admin/agents/governance/quick-action': { req: AdminAgentsGovernanceQuickActionRequest; res: AdminAgentsGovernanceQuickActionResponse };
	'admin/agents/governance/review/detail': { req: AdminAgentsGovernanceReviewDetailRequest; res: AdminAgentsGovernanceReviewDetailResponse };
	'admin/agents/governance/review/list': { req: AdminAgentsGovernanceReviewListRequest; res: AdminAgentsGovernanceReviewListResponse };
	'admin/agents/governance/review/resolve': { req: AdminAgentsGovernanceReviewResolveRequest; res: AdminAgentsGovernanceReviewResolveResponse };
	'admin/agents/governance/review/set-character-banned': { req: AdminAgentsGovernanceReviewSetCharacterBannedRequest; res: AdminAgentsGovernanceReviewSetCharacterBannedResponse };
	'admin/agents/governance/sessions/detail': { req: AdminAgentsGovernanceSessionsDetailRequest; res: AdminAgentsGovernanceSessionsDetailResponse };
	'admin/agents/governance/sessions/list': { req: AdminAgentsGovernanceSessionsListRequest; res: AdminAgentsGovernanceSessionsListResponse };
	'admin/agents/governance/sessions/set-banned': { req: AdminAgentsGovernanceSessionsSetBannedRequest; res: AdminAgentsGovernanceSessionsSetBannedResponse };
	'admin/agents/governance/summary': { req: EmptyRequest; res: AdminAgentsGovernanceSummaryResponse };
	'admin/agents/images/list': { req: AdminAgentsImagesListRequest; res: AdminAgentsImagesListResponse };
	'admin/agents/images/set-blocked': { req: AdminAgentsImagesSetBlockedRequest; res: AdminAgentsImagesSetBlockedResponse };
	'admin/agents/images/tokens/refresh': { req: EmptyRequest; res: AdminAgentsImagesTokensRefreshResponse };
	'admin/agents/images/tokens/test': { req: AdminAgentsImagesTokensTestRequest; res: AdminAgentsImagesTokensTestResponse };
	'admin/agents/messages/list': { req: AdminAgentsMessagesListRequest; res: AdminAgentsMessagesListResponse };
	'admin/agents/messages/timeline': { req: AdminAgentsMessagesTimelineRequest; res: AdminAgentsMessagesTimelineResponse };
	'admin/agents/redeem-codes/generate': { req: AdminAgentsRedeemCodesGenerateRequest; res: AdminAgentsRedeemCodesGenerateResponse };
	'admin/agents/redeem-codes/list': { req: AdminAgentsRedeemCodesListRequest; res: AdminAgentsRedeemCodesListResponse };
	'admin/agents/redeem-codes/revoke': { req: AdminAgentsRedeemCodesRevokeRequest; res: AdminAgentsRedeemCodesRevokeResponse };
	'admin/agents/reports/overview': { req: AdminAgentsReportsOverviewRequest; res: AdminAgentsReportsOverviewResponse };
	'admin/agents/review/diff': { req: AdminAgentsReviewDiffRequest; res: AdminAgentsReviewDiffResponse };
	'admin/agents/review/list-pending': { req: AdminAgentsReviewListPendingRequest; res: AdminAgentsReviewListPendingResponse };
	'admin/agents/review/logs': { req: AdminAgentsReviewLogsRequest; res: AdminAgentsReviewLogsResponse };
	'admin/agents/review/pending-exists': { req: EmptyRequest; res: AdminAgentsReviewPendingExistsResponse };
	'admin/agents/review/resolve': { req: AdminAgentsReviewResolveRequest; res: AdminAgentsReviewResolveResponse };
	'admin/agents/sessions/list': { req: AdminAgentsSessionsListRequest; res: AdminAgentsSessionsListResponse };
	'admin/agents/sessions/set-moderation-banned': { req: AdminAgentsSessionsSetModerationBannedRequest; res: AdminAgentsSessionsSetModerationBannedResponse };
	'admin/agents/tokenizer-status': { req: EmptyRequest; res: AdminAgentsTokenizerStatusResponse };
	'admin/announcements/create': { req: AdminAnnouncementsCreateRequest; res: AdminAnnouncementsCreateResponse };
	'admin/announcements/delete': { req: AdminAnnouncementsDeleteRequest; res: EmptyResponse };
	'admin/announcements/list': { req: AdminAnnouncementsListRequest; res: AdminAnnouncementsListResponse };
	'admin/announcements/update': { req: AdminAnnouncementsUpdateRequest; res: EmptyResponse };
	'admin/avatar-decorations/create': { req: AdminAvatarDecorationsCreateRequest; res: AdminAvatarDecorationsCreateResponse };
	'admin/avatar-decorations/delete': { req: AdminAvatarDecorationsDeleteRequest; res: EmptyResponse };
	'admin/avatar-decorations/list': { req: AdminAvatarDecorationsListRequest; res: AdminAvatarDecorationsListResponse };
	'admin/avatar-decorations/update': { req: AdminAvatarDecorationsUpdateRequest; res: EmptyResponse };
	'admin/captcha/current': { req: EmptyRequest; res: AdminCaptchaCurrentResponse };
	'admin/captcha/save': { req: AdminCaptchaSaveRequest; res: EmptyResponse };
	'admin/delete-account': { req: AdminDeleteAccountRequest; res: EmptyResponse };
	'admin/delete-all-files-of-a-user': { req: AdminDeleteAllFilesOfAUserRequest; res: EmptyResponse };
	'admin/drive/clean-remote-files': { req: EmptyRequest; res: EmptyResponse };
	'admin/drive/cleanup': { req: EmptyRequest; res: EmptyResponse };
	'admin/drive/files': { req: AdminDriveFilesRequest; res: AdminDriveFilesResponse };
	'admin/drive/files/set-blocked': { req: AdminDriveFilesSetBlockedRequest; res: AdminDriveFilesSetBlockedResponse };
	'admin/drive/show-file': { req: AdminDriveShowFileRequest; res: AdminDriveShowFileResponse };
	'admin/emoji/add': { req: AdminEmojiAddRequest; res: AdminEmojiAddResponse };
	'admin/emoji/add-aliases-bulk': { req: AdminEmojiAddAliasesBulkRequest; res: EmptyResponse };
	'admin/emoji/copy': { req: AdminEmojiCopyRequest; res: AdminEmojiCopyResponse };
	'admin/emoji/delete': { req: AdminEmojiDeleteRequest; res: EmptyResponse };
	'admin/emoji/delete-bulk': { req: AdminEmojiDeleteBulkRequest; res: EmptyResponse };
	'admin/emoji/import-zip': { req: AdminEmojiImportZipRequest; res: EmptyResponse };
	'admin/emoji/list': { req: AdminEmojiListRequest; res: AdminEmojiListResponse };
	'admin/emoji/list-remote': { req: AdminEmojiListRemoteRequest; res: AdminEmojiListRemoteResponse };
	'admin/emoji/remove-aliases-bulk': { req: AdminEmojiRemoveAliasesBulkRequest; res: EmptyResponse };
	'admin/emoji/set-aliases-bulk': { req: AdminEmojiSetAliasesBulkRequest; res: EmptyResponse };
	'admin/emoji/set-category-bulk': { req: AdminEmojiSetCategoryBulkRequest; res: EmptyResponse };
	'admin/emoji/set-license-bulk': { req: AdminEmojiSetLicenseBulkRequest; res: EmptyResponse };
	'admin/emoji/update': { req: AdminEmojiUpdateRequest; res: EmptyResponse };
	'admin/federation/delete-all-files': { req: AdminFederationDeleteAllFilesRequest; res: EmptyResponse };
	'admin/federation/refresh-remote-instance-metadata': { req: AdminFederationRefreshRemoteInstanceMetadataRequest; res: EmptyResponse };
	'admin/federation/remove-all-following': { req: AdminFederationRemoveAllFollowingRequest; res: EmptyResponse };
	'admin/federation/update-instance': { req: AdminFederationUpdateInstanceRequest; res: EmptyResponse };
	'admin/forward-abuse-user-report': { req: AdminForwardAbuseUserReportRequest; res: EmptyResponse };
	'admin/get-index-stats': { req: EmptyRequest; res: AdminGetIndexStatsResponse };
	'admin/get-table-stats': { req: EmptyRequest; res: AdminGetTableStatsResponse };
	'admin/get-user-ips': { req: AdminGetUserIpsRequest; res: AdminGetUserIpsResponse };
	'admin/invite/create': { req: AdminInviteCreateRequest; res: AdminInviteCreateResponse };
	'admin/invite/list': { req: AdminInviteListRequest; res: AdminInviteListResponse };
	'admin/meta': { req: EmptyRequest; res: AdminMetaResponse };
	'admin/migrate-featured-ranking': { req: EmptyRequest; res: AdminMigrateFeaturedRankingResponse };
	'admin/mobile-push/clear-devices': { req: EmptyRequest; res: AdminMobilePushClearDevicesResponse };
	'admin/promo/create': { req: AdminPromoCreateRequest; res: EmptyResponse };
	'admin/queue/clear': { req: AdminQueueClearRequest; res: EmptyResponse };
	'admin/queue/deliver-delayed': { req: EmptyRequest; res: AdminQueueDeliverDelayedResponse };
	'admin/queue/inbox-delayed': { req: EmptyRequest; res: AdminQueueInboxDelayedResponse };
	'admin/queue/jobs': { req: AdminQueueJobsRequest; res: AdminQueueJobsResponse };
	'admin/queue/promote-jobs': { req: AdminQueuePromoteJobsRequest; res: EmptyResponse };
	'admin/queue/queue-stats': { req: AdminQueueQueueStatsRequest; res: AdminQueueQueueStatsResponse };
	'admin/queue/queues': { req: EmptyRequest; res: AdminQueueQueuesResponse };
	'admin/queue/remove-job': { req: AdminQueueRemoveJobRequest; res: EmptyResponse };
	'admin/queue/retry-job': { req: AdminQueueRetryJobRequest; res: EmptyResponse };
	'admin/queue/show-job': { req: AdminQueueShowJobRequest; res: AdminQueueShowJobResponse };
	'admin/queue/show-job-logs': { req: AdminQueueShowJobLogsRequest; res: AdminQueueShowJobLogsResponse };
	'admin/queue/stats': { req: EmptyRequest; res: AdminQueueStatsResponse };
	'admin/relays/add': { req: AdminRelaysAddRequest; res: AdminRelaysAddResponse };
	'admin/relays/list': { req: EmptyRequest; res: AdminRelaysListResponse };
	'admin/relays/remove': { req: AdminRelaysRemoveRequest; res: EmptyResponse };
	'admin/reset-password': { req: AdminResetPasswordRequest; res: AdminResetPasswordResponse };
	'admin/resolve-abuse-user-report': { req: AdminResolveAbuseUserReportRequest; res: EmptyResponse };
	'admin/roles/assign': { req: AdminRolesAssignRequest; res: EmptyResponse };
	'admin/roles/create': { req: AdminRolesCreateRequest; res: AdminRolesCreateResponse };
	'admin/roles/delete': { req: AdminRolesDeleteRequest; res: EmptyResponse };
	'admin/roles/list': { req: EmptyRequest; res: AdminRolesListResponse };
	'admin/roles/show': { req: AdminRolesShowRequest; res: AdminRolesShowResponse };
	'admin/roles/unassign': { req: AdminRolesUnassignRequest; res: EmptyResponse };
	'admin/roles/update': { req: AdminRolesUpdateRequest; res: EmptyResponse };
	'admin/roles/update-default-policies': { req: AdminRolesUpdateDefaultPoliciesRequest; res: EmptyResponse };
	'admin/roles/users': { req: AdminRolesUsersRequest; res: AdminRolesUsersResponse };
	'admin/send-email': { req: AdminSendEmailRequest; res: EmptyResponse };
	'admin/server-info': { req: EmptyRequest; res: AdminServerInfoResponse };
	'admin/show-moderation-logs': { req: AdminShowModerationLogsRequest; res: AdminShowModerationLogsResponse };
	'admin/show-user': { req: AdminShowUserRequest; res: AdminShowUserResponse };
	'admin/show-users': { req: AdminShowUsersRequest; res: AdminShowUsersResponse };
	'admin/suspend-user': { req: AdminSuspendUserRequest; res: EmptyResponse };
	'admin/system-webhook/create': { req: AdminSystemWebhookCreateRequest; res: AdminSystemWebhookCreateResponse };
	'admin/system-webhook/delete': { req: AdminSystemWebhookDeleteRequest; res: EmptyResponse };
	'admin/system-webhook/list': { req: AdminSystemWebhookListRequest; res: AdminSystemWebhookListResponse };
	'admin/system-webhook/show': { req: AdminSystemWebhookShowRequest; res: AdminSystemWebhookShowResponse };
	'admin/system-webhook/test': { req: AdminSystemWebhookTestRequest; res: EmptyResponse };
	'admin/system-webhook/update': { req: AdminSystemWebhookUpdateRequest; res: AdminSystemWebhookUpdateResponse };
	'admin/unset-user-avatar': { req: AdminUnsetUserAvatarRequest; res: EmptyResponse };
	'admin/unset-user-banner': { req: AdminUnsetUserBannerRequest; res: EmptyResponse };
	'admin/unsuspend-user': { req: AdminUnsuspendUserRequest; res: EmptyResponse };
	'admin/update-abuse-user-report': { req: AdminUpdateAbuseUserReportRequest; res: EmptyResponse };
	'admin/update-meta': { req: AdminUpdateMetaRequest; res: EmptyResponse };
	'admin/update-proxy-account': { req: AdminUpdateProxyAccountRequest; res: AdminUpdateProxyAccountResponse };
	'admin/update-user-note': { req: AdminUpdateUserNoteRequest; res: EmptyResponse };
	'admin/users/agent-success-rate': { req: AdminUsersAgentSuccessRateRequest; res: AdminUsersAgentSuccessRateResponse };
	'agents/billing-logs': { req: AgentsBillingLogsRequest; res: AgentsBillingLogsResponse };
	'agents/byok/models/create': { req: AgentsByokModelsCreateRequest; res: AgentsByokModelsCreateResponse };
	'agents/byok/models/delete': { req: AgentsByokModelsDeleteRequest; res: AgentsByokModelsDeleteResponse };
	'agents/byok/models/list': { req: EmptyRequest; res: AgentsByokModelsListResponse };
	'agents/byok/models/update': { req: AgentsByokModelsUpdateRequest; res: AgentsByokModelsUpdateResponse };
	'agents/characters/create': { req: AgentsCharactersCreateRequest; res: AgentsCharactersCreateResponse };
	'agents/characters/delete': { req: AgentsCharactersDeleteRequest; res: AgentsCharactersDeleteResponse };
	'agents/characters/diff': { req: AgentsCharactersDiffRequest; res: AgentsCharactersDiffResponse };
	'agents/characters/list-mine': { req: EmptyRequest; res: AgentsCharactersListMineResponse };
	'agents/characters/plaza-detail': { req: AgentsCharactersPlazaDetailRequest; res: AgentsCharactersPlazaDetailResponse };
	'agents/characters/public-list': { req: AgentsCharactersPublicListRequest; res: AgentsCharactersPublicListResponse };
	'agents/characters/publish': { req: AgentsCharactersPublishRequest; res: AgentsCharactersPublishResponse };
	'agents/characters/rollback': { req: AgentsCharactersRollbackRequest; res: AgentsCharactersRollbackResponse };
	'agents/characters/show': { req: AgentsCharactersShowRequest; res: AgentsCharactersShowResponse };
	'agents/characters/unpublish': { req: AgentsCharactersUnpublishRequest; res: AgentsCharactersUnpublishResponse };
	'agents/characters/update': { req: AgentsCharactersUpdateRequest; res: AgentsCharactersUpdateResponse };
	'agents/characters/versions': { req: AgentsCharactersVersionsRequest; res: AgentsCharactersVersionsResponse };
	'agents/characters/worldbook-match-preview': { req: AgentsCharactersWorldbookMatchPreviewRequest; res: AgentsCharactersWorldbookMatchPreviewResponse };
	'agents/checkin': { req: EmptyRequest; res: AgentsCheckinResponse };
	'agents/checkin-makeup': { req: AgentsCheckinMakeupRequest; res: AgentsCheckinMakeupResponse };
	'agents/checkin-status': { req: AgentsCheckinStatusRequest; res: AgentsCheckinStatusResponse };
	'agents/compression-sticky/delete': { req: AgentsCompressionStickyDeleteRequest; res: AgentsCompressionStickyDeleteResponse };
	'agents/compression-sticky/import': { req: AgentsCompressionStickyImportRequest; res: AgentsCompressionStickyImportResponse };
	'agents/compression-sticky/list': { req: AgentsCompressionStickyListRequest; res: AgentsCompressionStickyListResponse };
	'agents/compression-sticky/reorder': { req: AgentsCompressionStickyReorderRequest; res: AgentsCompressionStickyReorderResponse };
	'agents/compression-sticky/update': { req: AgentsCompressionStickyUpdateRequest; res: AgentsCompressionStickyUpdateResponse };
	'agents/credit-balance': { req: EmptyRequest; res: AgentsCreditBalanceResponse };
	'agents/credits/migrate': { req: AgentsCreditsMigrateRequest; res: AgentsCreditsMigrateResponse };
	'agents/images/generate': { req: AgentsImagesGenerateRequest; res: AgentsImagesGenerateResponse };
	'agents/images/generate-placeholder': { req: AgentsImagesGeneratePlaceholderRequest; res: AgentsImagesGeneratePlaceholderResponse };
	'agents/images/models/list': { req: EmptyRequest; res: AgentsImagesModelsListResponse };
	'agents/images/placeholder-status': { req: AgentsImagesPlaceholderStatusRequest; res: AgentsImagesPlaceholderStatusResponse };
	'agents/images/presets/list': { req: EmptyRequest; res: AgentsImagesPresetsListResponse };
	'agents/memory/add': { req: AgentsMemoryAddRequest; res: AgentsMemoryAddResponse };
	'agents/memory/delete': { req: AgentsMemoryDeleteRequest; res: AgentsMemoryDeleteResponse };
	'agents/memory/list': { req: AgentsMemoryListRequest; res: AgentsMemoryListResponse };
	'agents/memory/update': { req: AgentsMemoryUpdateRequest; res: AgentsMemoryUpdateResponse };
	'agents/messages/abort': { req: AgentsMessagesAbortRequest; res: AgentsMessagesAbortResponse };
	'agents/messages/delete': { req: AgentsMessagesDeleteRequest; res: AgentsMessagesDeleteResponse };
	'agents/messages/import-context': { req: AgentsMessagesImportContextRequest; res: AgentsMessagesImportContextResponse };
	'agents/messages/rollback': { req: AgentsMessagesRollbackRequest; res: AgentsMessagesRollbackResponse };
	'agents/messages/search': { req: AgentsMessagesSearchRequest; res: AgentsMessagesSearchResponse };
	'agents/messages/send': { req: AgentsMessagesSendRequest; res: AgentsMessagesSendResponse };
	'agents/messages/show': { req: AgentsMessagesShowRequest; res: AgentsMessagesShowResponse };
	'agents/messages/timeline': { req: AgentsMessagesTimelineRequest; res: AgentsMessagesTimelineResponse };
	'agents/messages/update': { req: AgentsMessagesUpdateRequest; res: AgentsMessagesUpdateResponse };
	'agents/models/free-quota': { req: EmptyRequest; res: AgentsModelsFreeQuotaResponse };
	'agents/models/success-rates': { req: AgentsModelsSuccessRatesRequest; res: AgentsModelsSuccessRatesResponse };
	'agents/my-usage-summary': { req: AgentsMyUsageSummaryRequest; res: AgentsMyUsageSummaryResponse };
	'agents/plaza-reviews/create': { req: AgentsPlazaReviewsCreateRequest; res: AgentsPlazaReviewsCreateResponse };
	'agents/plaza-reviews/list': { req: AgentsPlazaReviewsListRequest; res: AgentsPlazaReviewsListResponse };
	'agents/plaza-search': { req: AgentsPlazaSearchRequest; res: AgentsPlazaSearchResponse };
	'agents/proactive-schedules/delete': { req: AgentsProactiveSchedulesDeleteRequest; res: AgentsProactiveSchedulesDeleteResponse };
	'agents/proactive-schedules/import': { req: AgentsProactiveSchedulesImportRequest; res: AgentsProactiveSchedulesImportResponse };
	'agents/proactive-schedules/list': { req: AgentsProactiveSchedulesListRequest; res: AgentsProactiveSchedulesListResponse };
	'agents/proactive-schedules/set-status': { req: AgentsProactiveSchedulesSetStatusRequest; res: AgentsProactiveSchedulesSetStatusResponse };
	'agents/redeem-code': { req: AgentsRedeemCodeRequest; res: AgentsRedeemCodeResponse };
	'agents/sessions/compression-overview': { req: AgentsSessionsCompressionOverviewRequest; res: AgentsSessionsCompressionOverviewResponse };
	'agents/sessions/context-window': { req: AgentsSessionsContextWindowRequest; res: AgentsSessionsContextWindowResponse };
	'agents/sessions/create': { req: AgentsSessionsCreateRequest; res: AgentsSessionsCreateResponse };
	'agents/sessions/delete': { req: AgentsSessionsDeleteRequest; res: AgentsSessionsDeleteResponse };
	'agents/sessions/list-mine': { req: EmptyRequest; res: AgentsSessionsListMineResponse };
	'agents/sessions/preview-model-change': { req: AgentsSessionsPreviewModelChangeRequest; res: AgentsSessionsPreviewModelChangeResponse };
	'agents/sessions/read': { req: AgentsSessionsReadRequest; res: EmptyResponse };
	'agents/sessions/read-all': { req: EmptyRequest; res: EmptyResponse };
	'agents/sessions/rule-list': { req: AgentsSessionsRuleListRequest; res: AgentsSessionsRuleListResponse };
	'agents/sessions/show': { req: AgentsSessionsShowRequest; res: AgentsSessionsShowResponse };
	'agents/sessions/update': { req: AgentsSessionsUpdateRequest; res: AgentsSessionsUpdateResponse };
	'agents/sessions/worldbook-list': { req: AgentsSessionsWorldbookListRequest; res: AgentsSessionsWorldbookListResponse };
	'agents/sessions/worldbook-match-preview': { req: AgentsSessionsWorldbookMatchPreviewRequest; res: AgentsSessionsWorldbookMatchPreviewResponse };
	'agents/styles/create': { req: AgentsStylesCreateRequest; res: AgentsStylesCreateResponse };
	'agents/styles/delete': { req: AgentsStylesDeleteRequest; res: AgentsStylesDeleteResponse };
	'agents/styles/diff': { req: AgentsStylesDiffRequest; res: AgentsStylesDiffResponse };
	'agents/styles/list-mine': { req: EmptyRequest; res: AgentsStylesListMineResponse };
	'agents/styles/list-usable': { req: EmptyRequest; res: AgentsStylesListUsableResponse };
	'agents/styles/plaza-detail': { req: AgentsStylesPlazaDetailRequest; res: AgentsStylesPlazaDetailResponse };
	'agents/styles/public-list': { req: AgentsStylesPublicListRequest; res: AgentsStylesPublicListResponse };
	'agents/styles/publish': { req: AgentsStylesPublishRequest; res: AgentsStylesPublishResponse };
	'agents/styles/rollback': { req: AgentsStylesRollbackRequest; res: AgentsStylesRollbackResponse };
	'agents/styles/show': { req: AgentsStylesShowRequest; res: AgentsStylesShowResponse };
	'agents/styles/subscribe': { req: AgentsStylesSubscribeRequest; res: AgentsStylesSubscribeResponse };
	'agents/styles/unpublish': { req: AgentsStylesUnpublishRequest; res: AgentsStylesUnpublishResponse };
	'agents/styles/unsubscribe': { req: AgentsStylesUnsubscribeRequest; res: AgentsStylesUnsubscribeResponse };
	'agents/styles/update': { req: AgentsStylesUpdateRequest; res: AgentsStylesUpdateResponse };
	'agents/styles/versions': { req: AgentsStylesVersionsRequest; res: AgentsStylesVersionsResponse };
	'agents/vision-models/list': { req: EmptyRequest; res: AgentsVisionModelsListResponse };
	'announcements': { req: AnnouncementsRequest; res: AnnouncementsResponse };
	'announcements/show': { req: AnnouncementsShowRequest; res: AnnouncementsShowResponse };
	'antennas/create': { req: AntennasCreateRequest; res: AntennasCreateResponse };
	'antennas/delete': { req: AntennasDeleteRequest; res: EmptyResponse };
	'antennas/list': { req: EmptyRequest; res: AntennasListResponse };
	'antennas/notes': { req: AntennasNotesRequest; res: AntennasNotesResponse };
	'antennas/show': { req: AntennasShowRequest; res: AntennasShowResponse };
	'antennas/update': { req: AntennasUpdateRequest; res: AntennasUpdateResponse };
	'ap/get': { req: ApGetRequest; res: ApGetResponse };
	'ap/show': { req: ApShowRequest; res: ApShowResponse };
	'app/create': { req: AppCreateRequest; res: AppCreateResponse };
	'app/show': { req: AppShowRequest; res: AppShowResponse };
	'auth/accept': { req: AuthAcceptRequest; res: EmptyResponse };
	'auth/session/generate': { req: AuthSessionGenerateRequest; res: AuthSessionGenerateResponse };
	'auth/session/show': { req: AuthSessionShowRequest; res: AuthSessionShowResponse };
	'auth/session/userkey': { req: AuthSessionUserkeyRequest; res: AuthSessionUserkeyResponse };
	'blocking/create': { req: BlockingCreateRequest; res: BlockingCreateResponse };
	'blocking/delete': { req: BlockingDeleteRequest; res: BlockingDeleteResponse };
	'blocking/list': { req: BlockingListRequest; res: BlockingListResponse };
	'bubble-game/ranking': { req: BubbleGameRankingRequest; res: BubbleGameRankingResponse };
	'bubble-game/register': { req: BubbleGameRegisterRequest; res: EmptyResponse };
	'channels/create': { req: ChannelsCreateRequest; res: ChannelsCreateResponse };
	'channels/favorite': { req: ChannelsFavoriteRequest; res: EmptyResponse };
	'channels/featured': { req: EmptyRequest; res: ChannelsFeaturedResponse };
	'channels/follow': { req: ChannelsFollowRequest; res: EmptyResponse };
	'channels/followed': { req: ChannelsFollowedRequest; res: ChannelsFollowedResponse };
	'channels/mute/create': { req: ChannelsMuteCreateRequest; res: EmptyResponse };
	'channels/mute/delete': { req: ChannelsMuteDeleteRequest; res: EmptyResponse };
	'channels/mute/list': { req: EmptyRequest; res: ChannelsMuteListResponse };
	'channels/my-favorites': { req: EmptyRequest; res: ChannelsMyFavoritesResponse };
	'channels/owned': { req: ChannelsOwnedRequest; res: ChannelsOwnedResponse };
	'channels/search': { req: ChannelsSearchRequest; res: ChannelsSearchResponse };
	'channels/show': { req: ChannelsShowRequest; res: ChannelsShowResponse };
	'channels/timeline': { req: ChannelsTimelineRequest; res: ChannelsTimelineResponse };
	'channels/unfavorite': { req: ChannelsUnfavoriteRequest; res: EmptyResponse };
	'channels/unfollow': { req: ChannelsUnfollowRequest; res: EmptyResponse };
	'channels/update': { req: ChannelsUpdateRequest; res: ChannelsUpdateResponse };
	'charts/active-users': { req: ChartsActiveUsersRequest; res: ChartsActiveUsersResponse };
	'charts/ap-request': { req: ChartsApRequestRequest; res: ChartsApRequestResponse };
	'charts/drive': { req: ChartsDriveRequest; res: ChartsDriveResponse };
	'charts/federation': { req: ChartsFederationRequest; res: ChartsFederationResponse };
	'charts/instance': { req: ChartsInstanceRequest; res: ChartsInstanceResponse };
	'charts/notes': { req: ChartsNotesRequest; res: ChartsNotesResponse };
	'charts/user/drive': { req: ChartsUserDriveRequest; res: ChartsUserDriveResponse };
	'charts/user/following': { req: ChartsUserFollowingRequest; res: ChartsUserFollowingResponse };
	'charts/user/notes': { req: ChartsUserNotesRequest; res: ChartsUserNotesResponse };
	'charts/user/pv': { req: ChartsUserPvRequest; res: ChartsUserPvResponse };
	'charts/user/reactions': { req: ChartsUserReactionsRequest; res: ChartsUserReactionsResponse };
	'charts/users': { req: ChartsUsersRequest; res: ChartsUsersResponse };
	'chat/history': { req: ChatHistoryRequest; res: ChatHistoryResponse };
	'chat/messages/create-to-room': { req: ChatMessagesCreateToRoomRequest; res: ChatMessagesCreateToRoomResponse };
	'chat/messages/create-to-user': { req: ChatMessagesCreateToUserRequest; res: ChatMessagesCreateToUserResponse };
	'chat/messages/delete': { req: ChatMessagesDeleteRequest; res: EmptyResponse };
	'chat/messages/react': { req: ChatMessagesReactRequest; res: EmptyResponse };
	'chat/messages/room-timeline': { req: ChatMessagesRoomTimelineRequest; res: ChatMessagesRoomTimelineResponse };
	'chat/messages/search': { req: ChatMessagesSearchRequest; res: ChatMessagesSearchResponse };
	'chat/messages/show': { req: ChatMessagesShowRequest; res: ChatMessagesShowResponse };
	'chat/messages/unreact': { req: ChatMessagesUnreactRequest; res: EmptyResponse };
	'chat/messages/user-timeline': { req: ChatMessagesUserTimelineRequest; res: ChatMessagesUserTimelineResponse };
	'chat/read': { req: ChatReadRequest; res: EmptyResponse };
	'chat/read-all': { req: EmptyRequest; res: EmptyResponse };
	'chat/rooms/create': { req: ChatRoomsCreateRequest; res: ChatRoomsCreateResponse };
	'chat/rooms/delete': { req: ChatRoomsDeleteRequest; res: EmptyResponse };
	'chat/rooms/invitations/create': { req: ChatRoomsInvitationsCreateRequest; res: ChatRoomsInvitationsCreateResponse };
	'chat/rooms/invitations/ignore': { req: ChatRoomsInvitationsIgnoreRequest; res: EmptyResponse };
	'chat/rooms/invitations/inbox': { req: ChatRoomsInvitationsInboxRequest; res: ChatRoomsInvitationsInboxResponse };
	'chat/rooms/invitations/outbox': { req: ChatRoomsInvitationsOutboxRequest; res: ChatRoomsInvitationsOutboxResponse };
	'chat/rooms/join': { req: ChatRoomsJoinRequest; res: EmptyResponse };
	'chat/rooms/joining': { req: ChatRoomsJoiningRequest; res: ChatRoomsJoiningResponse };
	'chat/rooms/kick': { req: ChatRoomsKickRequest; res: EmptyResponse };
	'chat/rooms/leave': { req: ChatRoomsLeaveRequest; res: EmptyResponse };
	'chat/rooms/members': { req: ChatRoomsMembersRequest; res: ChatRoomsMembersResponse };
	'chat/rooms/mute': { req: ChatRoomsMuteRequest; res: EmptyResponse };
	'chat/rooms/owned': { req: ChatRoomsOwnedRequest; res: ChatRoomsOwnedResponse };
	'chat/rooms/search': { req: ChatRoomsSearchRequest; res: ChatRoomsSearchResponse };
	'chat/rooms/show': { req: ChatRoomsShowRequest; res: ChatRoomsShowResponse };
	'chat/rooms/suspend': { req: ChatRoomsSuspendRequest; res: EmptyResponse };
	'chat/rooms/unsuspend': { req: ChatRoomsUnsuspendRequest; res: EmptyResponse };
	'chat/rooms/update': { req: ChatRoomsUpdateRequest; res: ChatRoomsUpdateResponse };
	'clips/add-note': { req: ClipsAddNoteRequest; res: EmptyResponse };
	'clips/create': { req: ClipsCreateRequest; res: ClipsCreateResponse };
	'clips/delete': { req: ClipsDeleteRequest; res: EmptyResponse };
	'clips/favorite': { req: ClipsFavoriteRequest; res: EmptyResponse };
	'clips/list': { req: ClipsListRequest; res: ClipsListResponse };
	'clips/my-favorites': { req: EmptyRequest; res: ClipsMyFavoritesResponse };
	'clips/notes': { req: ClipsNotesRequest; res: ClipsNotesResponse };
	'clips/remove-note': { req: ClipsRemoveNoteRequest; res: EmptyResponse };
	'clips/show': { req: ClipsShowRequest; res: ClipsShowResponse };
	'clips/unfavorite': { req: ClipsUnfavoriteRequest; res: EmptyResponse };
	'clips/update': { req: ClipsUpdateRequest; res: ClipsUpdateResponse };
	'drive': { req: EmptyRequest; res: DriveResponse };
	'drive/files': { req: DriveFilesRequest; res: DriveFilesResponse };
	'drive/files/attached-chat-messages': { req: DriveFilesAttachedChatMessagesRequest; res: DriveFilesAttachedChatMessagesResponse };
	'drive/files/attached-notes': { req: DriveFilesAttachedNotesRequest; res: DriveFilesAttachedNotesResponse };
	'drive/files/check-existence': { req: DriveFilesCheckExistenceRequest; res: DriveFilesCheckExistenceResponse };
	'drive/files/create': { req: DriveFilesCreateRequest; res: DriveFilesCreateResponse };
	'drive/files/delete': { req: DriveFilesDeleteRequest; res: EmptyResponse };
	'drive/files/download-url': { req: DriveFilesDownloadUrlRequest; res: DriveFilesDownloadUrlResponse };
	'drive/files/find': { req: DriveFilesFindRequest; res: DriveFilesFindResponse };
	'drive/files/find-by-hash': { req: DriveFilesFindByHashRequest; res: DriveFilesFindByHashResponse };
	'drive/files/move-bulk': { req: DriveFilesMoveBulkRequest; res: EmptyResponse };
	'drive/files/show': { req: DriveFilesShowRequest; res: DriveFilesShowResponse };
	'drive/files/update': { req: DriveFilesUpdateRequest; res: DriveFilesUpdateResponse };
	'drive/files/upload-from-url': { req: DriveFilesUploadFromUrlRequest; res: EmptyResponse };
	'drive/folders': { req: DriveFoldersRequest; res: DriveFoldersResponse };
	'drive/folders/create': { req: DriveFoldersCreateRequest; res: DriveFoldersCreateResponse };
	'drive/folders/delete': { req: DriveFoldersDeleteRequest; res: EmptyResponse };
	'drive/folders/find': { req: DriveFoldersFindRequest; res: DriveFoldersFindResponse };
	'drive/folders/show': { req: DriveFoldersShowRequest; res: DriveFoldersShowResponse };
	'drive/folders/update': { req: DriveFoldersUpdateRequest; res: DriveFoldersUpdateResponse };
	'drive/stats': { req: EmptyRequest; res: DriveStatsResponse };
	'drive/stream': { req: DriveStreamRequest; res: DriveStreamResponse };
	'email-address/available': { req: EmailAddressAvailableRequest; res: EmailAddressAvailableResponse };
	'emoji': { req: EmojiRequest; res: EmojiResponse };
	'emojis': { req: EmptyRequest; res: EmojisResponse };
	'endpoint': { req: EndpointRequest; res: EndpointResponse };
	'endpoints': { req: EmptyRequest; res: EndpointsResponse };
	'export-custom-emojis': { req: EmptyRequest; res: EmptyResponse };
	'federation/followers': { req: FederationFollowersRequest; res: FederationFollowersResponse };
	'federation/following': { req: FederationFollowingRequest; res: FederationFollowingResponse };
	'federation/instances': { req: FederationInstancesRequest; res: FederationInstancesResponse };
	'federation/show-instance': { req: FederationShowInstanceRequest; res: FederationShowInstanceResponse };
	'federation/stats': { req: FederationStatsRequest; res: FederationStatsResponse };
	'federation/update-remote-user': { req: FederationUpdateRemoteUserRequest; res: EmptyResponse };
	'federation/users': { req: FederationUsersRequest; res: FederationUsersResponse };
	'fetch-external-resources': { req: FetchExternalResourcesRequest; res: FetchExternalResourcesResponse };
	'fetch-rss': { req: FetchRssRequest; res: FetchRssResponse };
	'flash/create': { req: FlashCreateRequest; res: FlashCreateResponse };
	'flash/delete': { req: FlashDeleteRequest; res: EmptyResponse };
	'flash/featured': { req: FlashFeaturedRequest; res: FlashFeaturedResponse };
	'flash/like': { req: FlashLikeRequest; res: EmptyResponse };
	'flash/my': { req: FlashMyRequest; res: FlashMyResponse };
	'flash/my-likes': { req: FlashMyLikesRequest; res: FlashMyLikesResponse };
	'flash/search': { req: FlashSearchRequest; res: FlashSearchResponse };
	'flash/show': { req: FlashShowRequest; res: FlashShowResponse };
	'flash/unlike': { req: FlashUnlikeRequest; res: EmptyResponse };
	'flash/update': { req: FlashUpdateRequest; res: EmptyResponse };
	'following/create': { req: FollowingCreateRequest; res: FollowingCreateResponse };
	'following/delete': { req: FollowingDeleteRequest; res: FollowingDeleteResponse };
	'following/invalidate': { req: FollowingInvalidateRequest; res: FollowingInvalidateResponse };
	'following/requests/accept': { req: FollowingRequestsAcceptRequest; res: EmptyResponse };
	'following/requests/cancel': { req: FollowingRequestsCancelRequest; res: FollowingRequestsCancelResponse };
	'following/requests/list': { req: FollowingRequestsListRequest; res: FollowingRequestsListResponse };
	'following/requests/reject': { req: FollowingRequestsRejectRequest; res: EmptyResponse };
	'following/requests/sent': { req: FollowingRequestsSentRequest; res: FollowingRequestsSentResponse };
	'following/update': { req: FollowingUpdateRequest; res: FollowingUpdateResponse };
	'following/update-all': { req: FollowingUpdateAllRequest; res: EmptyResponse };
	'gallery/featured': { req: GalleryFeaturedRequest; res: GalleryFeaturedResponse };
	'gallery/popular': { req: EmptyRequest; res: GalleryPopularResponse };
	'gallery/posts': { req: GalleryPostsRequest; res: GalleryPostsResponse };
	'gallery/posts/create': { req: GalleryPostsCreateRequest; res: GalleryPostsCreateResponse };
	'gallery/posts/delete': { req: GalleryPostsDeleteRequest; res: EmptyResponse };
	'gallery/posts/like': { req: GalleryPostsLikeRequest; res: EmptyResponse };
	'gallery/posts/show': { req: GalleryPostsShowRequest; res: GalleryPostsShowResponse };
	'gallery/posts/unlike': { req: GalleryPostsUnlikeRequest; res: EmptyResponse };
	'gallery/posts/update': { req: GalleryPostsUpdateRequest; res: GalleryPostsUpdateResponse };
	'get-avatar-decorations': { req: EmptyRequest; res: GetAvatarDecorationsResponse };
	'get-online-users-count': { req: EmptyRequest; res: GetOnlineUsersCountResponse };
	'hashtags/list': { req: HashtagsListRequest; res: HashtagsListResponse };
	'hashtags/search': { req: HashtagsSearchRequest; res: HashtagsSearchResponse };
	'hashtags/show': { req: HashtagsShowRequest; res: HashtagsShowResponse };
	'hashtags/trend': { req: EmptyRequest; res: HashtagsTrendResponse };
	'hashtags/users': { req: HashtagsUsersRequest; res: HashtagsUsersResponse };
	'i': { req: EmptyRequest; res: IResponse };
	'i/2fa/done': { req: I2faDoneRequest; res: I2faDoneResponse };
	'i/2fa/key-done': { req: I2faKeyDoneRequest; res: I2faKeyDoneResponse };
	'i/2fa/password-less': { req: I2faPasswordLessRequest; res: EmptyResponse };
	'i/2fa/register': { req: I2faRegisterRequest; res: I2faRegisterResponse };
	'i/2fa/register-key': { req: I2faRegisterKeyRequest; res: I2faRegisterKeyResponse };
	'i/2fa/remove-key': { req: I2faRemoveKeyRequest; res: EmptyResponse };
	'i/2fa/unregister': { req: I2faUnregisterRequest; res: EmptyResponse };
	'i/2fa/update-key': { req: I2faUpdateKeyRequest; res: EmptyResponse };
	'i/apps': { req: IAppsRequest; res: IAppsResponse };
	'i/authorized-apps': { req: IAuthorizedAppsRequest; res: IAuthorizedAppsResponse };
	'i/change-password': { req: IChangePasswordRequest; res: EmptyResponse };
	'i/claim-achievement': { req: IClaimAchievementRequest; res: EmptyResponse };
	'i/delete-account': { req: IDeleteAccountRequest; res: EmptyResponse };
	'i/export-antennas': { req: EmptyRequest; res: EmptyResponse };
	'i/export-blocking': { req: EmptyRequest; res: EmptyResponse };
	'i/export-clips': { req: EmptyRequest; res: EmptyResponse };
	'i/export-favorites': { req: EmptyRequest; res: EmptyResponse };
	'i/export-following': { req: IExportFollowingRequest; res: EmptyResponse };
	'i/export-mute': { req: EmptyRequest; res: EmptyResponse };
	'i/export-notes': { req: EmptyRequest; res: EmptyResponse };
	'i/export-user-lists': { req: EmptyRequest; res: EmptyResponse };
	'i/favorites': { req: IFavoritesRequest; res: IFavoritesResponse };
	'i/gallery/likes': { req: IGalleryLikesRequest; res: IGalleryLikesResponse };
	'i/gallery/posts': { req: IGalleryPostsRequest; res: IGalleryPostsResponse };
	'i/import-antennas': { req: IImportAntennasRequest; res: EmptyResponse };
	'i/import-blocking': { req: IImportBlockingRequest; res: EmptyResponse };
	'i/import-following': { req: IImportFollowingRequest; res: EmptyResponse };
	'i/import-muting': { req: IImportMutingRequest; res: EmptyResponse };
	'i/import-user-lists': { req: IImportUserListsRequest; res: EmptyResponse };
	'i/move': { req: IMoveRequest; res: IMoveResponse };
	'i/notifications': { req: INotificationsRequest; res: INotificationsResponse };
	'i/notifications-grouped': { req: INotificationsGroupedRequest; res: INotificationsGroupedResponse };
	'i/page-likes': { req: IPageLikesRequest; res: IPageLikesResponse };
	'i/pages': { req: IPagesRequest; res: IPagesResponse };
	'i/pin': { req: IPinRequest; res: IPinResponse };
	'i/read-announcement': { req: IReadAnnouncementRequest; res: EmptyResponse };
	'i/regenerate-token': { req: IRegenerateTokenRequest; res: EmptyResponse };
	'i/registry/get': { req: IRegistryGetRequest; res: IRegistryGetResponse };
	'i/registry/get-all': { req: IRegistryGetAllRequest; res: IRegistryGetAllResponse };
	'i/registry/get-detail': { req: IRegistryGetDetailRequest; res: IRegistryGetDetailResponse };
	'i/registry/keys': { req: IRegistryKeysRequest; res: IRegistryKeysResponse };
	'i/registry/keys-with-type': { req: IRegistryKeysWithTypeRequest; res: IRegistryKeysWithTypeResponse };
	'i/registry/remove': { req: IRegistryRemoveRequest; res: EmptyResponse };
	'i/registry/scopes-with-domain': { req: EmptyRequest; res: IRegistryScopesWithDomainResponse };
	'i/registry/set': { req: IRegistrySetRequest; res: EmptyResponse };
	'i/revoke-token': { req: IRevokeTokenRequest; res: EmptyResponse };
	'i/signin-history': { req: ISigninHistoryRequest; res: ISigninHistoryResponse };
	'i/unpin': { req: IUnpinRequest; res: IUnpinResponse };
	'i/update': { req: IUpdateRequest; res: IUpdateResponse };
	'i/update-email': { req: IUpdateEmailRequest; res: IUpdateEmailResponse };
	'i/webhooks/create': { req: IWebhooksCreateRequest; res: IWebhooksCreateResponse };
	'i/webhooks/delete': { req: IWebhooksDeleteRequest; res: EmptyResponse };
	'i/webhooks/list': { req: EmptyRequest; res: IWebhooksListResponse };
	'i/webhooks/show': { req: IWebhooksShowRequest; res: IWebhooksShowResponse };
	'i/webhooks/test': { req: IWebhooksTestRequest; res: EmptyResponse };
	'i/webhooks/update': { req: IWebhooksUpdateRequest; res: EmptyResponse };
	'invite/create': { req: EmptyRequest; res: InviteCreateResponse };
	'invite/delete': { req: InviteDeleteRequest; res: EmptyResponse };
	'invite/limit': { req: EmptyRequest; res: InviteLimitResponse };
	'invite/list': { req: InviteListRequest; res: InviteListResponse };
	'meta': { req: MetaRequest; res: MetaResponse };
	'miauth/gen-token': { req: MiauthGenTokenRequest; res: MiauthGenTokenResponse };
	'mobile-push/register': { req: MobilePushRegisterRequest; res: MobilePushRegisterResponse };
	'mobile-push/unregister': { req: MobilePushUnregisterRequest; res: MobilePushUnregisterResponse };
	'mute/create': { req: MuteCreateRequest; res: EmptyResponse };
	'mute/delete': { req: MuteDeleteRequest; res: EmptyResponse };
	'mute/list': { req: MuteListRequest; res: MuteListResponse };
	'my/apps': { req: MyAppsRequest; res: MyAppsResponse };
	'notes': { req: NotesRequest; res: NotesResponse };
	'notes/children': { req: NotesChildrenRequest; res: NotesChildrenResponse };
	'notes/clips': { req: NotesClipsRequest; res: NotesClipsResponse };
	'notes/conversation': { req: NotesConversationRequest; res: NotesConversationResponse };
	'notes/create': { req: NotesCreateRequest; res: NotesCreateResponse };
	'notes/delete': { req: NotesDeleteRequest; res: EmptyResponse };
	'notes/drafts/count': { req: EmptyRequest; res: NotesDraftsCountResponse };
	'notes/drafts/create': { req: NotesDraftsCreateRequest; res: NotesDraftsCreateResponse };
	'notes/drafts/delete': { req: NotesDraftsDeleteRequest; res: EmptyResponse };
	'notes/drafts/list': { req: NotesDraftsListRequest; res: NotesDraftsListResponse };
	'notes/drafts/update': { req: NotesDraftsUpdateRequest; res: NotesDraftsUpdateResponse };
	'notes/favorites/create': { req: NotesFavoritesCreateRequest; res: EmptyResponse };
	'notes/favorites/delete': { req: NotesFavoritesDeleteRequest; res: EmptyResponse };
	'notes/featured': { req: NotesFeaturedRequest; res: NotesFeaturedResponse };
	'notes/global-timeline': { req: NotesGlobalTimelineRequest; res: NotesGlobalTimelineResponse };
	'notes/hybrid-timeline': { req: NotesHybridTimelineRequest; res: NotesHybridTimelineResponse };
	'notes/local-timeline': { req: NotesLocalTimelineRequest; res: NotesLocalTimelineResponse };
	'notes/mentions': { req: NotesMentionsRequest; res: NotesMentionsResponse };
	'notes/polls/recommendation': { req: NotesPollsRecommendationRequest; res: NotesPollsRecommendationResponse };
	'notes/polls/vote': { req: NotesPollsVoteRequest; res: EmptyResponse };
	'notes/reactions': { req: NotesReactionsRequest; res: NotesReactionsResponse };
	'notes/reactions/create': { req: NotesReactionsCreateRequest; res: EmptyResponse };
	'notes/reactions/delete': { req: NotesReactionsDeleteRequest; res: EmptyResponse };
	'notes/renotes': { req: NotesRenotesRequest; res: NotesRenotesResponse };
	'notes/replies': { req: NotesRepliesRequest; res: NotesRepliesResponse };
	'notes/search': { req: NotesSearchRequest; res: NotesSearchResponse };
	'notes/search-by-tag': { req: NotesSearchByTagRequest; res: NotesSearchByTagResponse };
	'notes/show': { req: NotesShowRequest; res: NotesShowResponse };
	'notes/show-partial-bulk': { req: NotesShowPartialBulkRequest; res: NotesShowPartialBulkResponse };
	'notes/state': { req: NotesStateRequest; res: NotesStateResponse };
	'notes/thread-muting/create': { req: NotesThreadMutingCreateRequest; res: EmptyResponse };
	'notes/thread-muting/delete': { req: NotesThreadMutingDeleteRequest; res: EmptyResponse };
	'notes/timeline': { req: NotesTimelineRequest; res: NotesTimelineResponse };
	'notes/translate': { req: NotesTranslateRequest; res: NotesTranslateResponse };
	'notes/unrenote': { req: NotesUnrenoteRequest; res: EmptyResponse };
	'notes/user-list-timeline': { req: NotesUserListTimelineRequest; res: NotesUserListTimelineResponse };
	'notifications/create': { req: NotificationsCreateRequest; res: EmptyResponse };
	'notifications/flush': { req: EmptyRequest; res: EmptyResponse };
	'notifications/mark-all-as-read': { req: EmptyRequest; res: EmptyResponse };
	'notifications/test-notification': { req: EmptyRequest; res: EmptyResponse };
	'page-push': { req: PagePushRequest; res: EmptyResponse };
	'pages/create': { req: PagesCreateRequest; res: PagesCreateResponse };
	'pages/delete': { req: PagesDeleteRequest; res: EmptyResponse };
	'pages/featured': { req: EmptyRequest; res: PagesFeaturedResponse };
	'pages/like': { req: PagesLikeRequest; res: EmptyResponse };
	'pages/show': { req: PagesShowRequest; res: PagesShowResponse };
	'pages/unlike': { req: PagesUnlikeRequest; res: EmptyResponse };
	'pages/update': { req: PagesUpdateRequest; res: EmptyResponse };
	'ping': { req: EmptyRequest; res: PingResponse };
	'pinned-users': { req: EmptyRequest; res: PinnedUsersResponse };
	'promo/read': { req: PromoReadRequest; res: EmptyResponse };
	'renote-mute/create': { req: RenoteMuteCreateRequest; res: EmptyResponse };
	'renote-mute/delete': { req: RenoteMuteDeleteRequest; res: EmptyResponse };
	'renote-mute/list': { req: RenoteMuteListRequest; res: RenoteMuteListResponse };
	'request-reset-password': { req: RequestResetPasswordRequest; res: EmptyResponse };
	'reset-db': { req: EmptyRequest; res: EmptyResponse };
	'reset-password': { req: ResetPasswordRequest; res: EmptyResponse };
	'retention': { req: EmptyRequest; res: RetentionResponse };
	'reversi/cancel-match': { req: ReversiCancelMatchRequest; res: EmptyResponse };
	'reversi/games': { req: ReversiGamesRequest; res: ReversiGamesResponse };
	'reversi/invitations': { req: EmptyRequest; res: ReversiInvitationsResponse };
	'reversi/match': { req: ReversiMatchRequest; res: ReversiMatchResponse };
	'reversi/show-game': { req: ReversiShowGameRequest; res: ReversiShowGameResponse };
	'reversi/surrender': { req: ReversiSurrenderRequest; res: EmptyResponse };
	'reversi/verify': { req: ReversiVerifyRequest; res: ReversiVerifyResponse };
	'roles/list': { req: EmptyRequest; res: RolesListResponse };
	'roles/notes': { req: RolesNotesRequest; res: RolesNotesResponse };
	'roles/show': { req: RolesShowRequest; res: RolesShowResponse };
	'roles/users': { req: RolesUsersRequest; res: RolesUsersResponse };
	'server-info': { req: EmptyRequest; res: ServerInfoResponse };
	'stats': { req: EmptyRequest; res: StatsResponse };
	'sw/register': { req: SwRegisterRequest; res: SwRegisterResponse };
	'sw/show-registration': { req: SwShowRegistrationRequest; res: SwShowRegistrationResponse };
	'sw/unregister': { req: SwUnregisterRequest; res: EmptyResponse };
	'sw/update-registration': { req: SwUpdateRegistrationRequest; res: SwUpdateRegistrationResponse };
	'test': { req: TestRequest; res: TestResponse };
	'username/available': { req: UsernameAvailableRequest; res: UsernameAvailableResponse };
	'users': { req: UsersRequest; res: UsersResponse };
	'users/achievements': { req: UsersAchievementsRequest; res: UsersAchievementsResponse };
	'users/clips': { req: UsersClipsRequest; res: UsersClipsResponse };
	'users/featured-notes': { req: UsersFeaturedNotesRequest; res: UsersFeaturedNotesResponse };
	'users/flashs': { req: UsersFlashsRequest; res: UsersFlashsResponse };
	'users/followers': { req: UsersFollowersRequest; res: UsersFollowersResponse };
	'users/following': { req: UsersFollowingRequest; res: UsersFollowingResponse };
	'users/gallery/posts': { req: UsersGalleryPostsRequest; res: UsersGalleryPostsResponse };
	'users/get-following-birthday-users': { req: UsersGetFollowingBirthdayUsersRequest; res: UsersGetFollowingBirthdayUsersResponse };
	'users/get-frequently-replied-users': { req: UsersGetFrequentlyRepliedUsersRequest; res: UsersGetFrequentlyRepliedUsersResponse };
	'users/lists/create': { req: UsersListsCreateRequest; res: UsersListsCreateResponse };
	'users/lists/create-from-public': { req: UsersListsCreateFromPublicRequest; res: UsersListsCreateFromPublicResponse };
	'users/lists/delete': { req: UsersListsDeleteRequest; res: EmptyResponse };
	'users/lists/favorite': { req: UsersListsFavoriteRequest; res: EmptyResponse };
	'users/lists/get-memberships': { req: UsersListsGetMembershipsRequest; res: UsersListsGetMembershipsResponse };
	'users/lists/list': { req: UsersListsListRequest; res: UsersListsListResponse };
	'users/lists/pull': { req: UsersListsPullRequest; res: EmptyResponse };
	'users/lists/push': { req: UsersListsPushRequest; res: EmptyResponse };
	'users/lists/show': { req: UsersListsShowRequest; res: UsersListsShowResponse };
	'users/lists/unfavorite': { req: UsersListsUnfavoriteRequest; res: EmptyResponse };
	'users/lists/update': { req: UsersListsUpdateRequest; res: UsersListsUpdateResponse };
	'users/lists/update-membership': { req: UsersListsUpdateMembershipRequest; res: EmptyResponse };
	'users/notes': { req: UsersNotesRequest; res: UsersNotesResponse };
	'users/pages': { req: UsersPagesRequest; res: UsersPagesResponse };
	'users/reactions': { req: UsersReactionsRequest; res: UsersReactionsResponse };
	'users/recommendation': { req: UsersRecommendationRequest; res: UsersRecommendationResponse };
	'users/relation': { req: UsersRelationRequest; res: UsersRelationResponse };
	'users/report-abuse': { req: UsersReportAbuseRequest; res: EmptyResponse };
	'users/search': { req: UsersSearchRequest; res: UsersSearchResponse };
	'users/search-by-username-and-host': { req: UsersSearchByUsernameAndHostRequest; res: UsersSearchByUsernameAndHostResponse };
	'users/show': { req: UsersShowRequest; res: UsersShowResponse };
	'users/update-memo': { req: UsersUpdateMemoRequest; res: EmptyResponse };
	'v2/admin/emoji/list': { req: V2AdminEmojiListRequest; res: V2AdminEmojiListResponse };
	'verify-email': { req: VerifyEmailRequest; res: EmptyResponse };
};

/**
 * NOTE: The content-type for all endpoints not listed here is application/json.
 */
export const endpointReqTypes = {
	'drive/files/create': 'multipart/form-data',
} as const satisfies { [K in keyof Endpoints]?: 'multipart/form-data'; };
